--- START OF FILE app.js ---

// app.js - For Student Portal (index.html)

// --- IMPORTS ---
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    onSnapshot,
    collection,
    query,
    where,
    runTransaction,
    serverTimestamp,
    orderBy,
    initializeFirestore
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const TEACHER_EMAIL = "teacher@example.com";
let studentDataUnsubscribe = null;

// --- CHANGE: Leveling System Configuration (100xp intervals) ---
const levelThresholds = Array.from({ length: 10 }, (_, i) => ({
    level: i + 1,
    xp: i * 100
}));

function calculateLevel(xp) {
    // With 100xp intervals, we can use a simple formula.
    // Level 1: 0-99, Level 2: 100-199, etc.
    if (xp < 0) return 1; // Should not happen, but good practice
    const level = Math.floor(xp / 100) + 1;
    return level > 10 ? 10 : level; // Cap at level 10
}


// --- AUTHENTICATION LOGIC ---
onAuthStateChanged(auth, user => {
    if (user) {
        if (user.email === TEACHER_EMAIL) {
            signOut(auth);
            return;
        }
        showDashboard();
        initializeStudentDashboard(user.uid);
    } else {
        showAuthView();
        if (studentDataUnsubscribe) {
            studentDataUnsubscribe();
        }
    }
});

// --- UI TOGGLING FUNCTIONS ---
function showAuthView() {
    document.getElementById('auth-view').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
}

function showDashboard() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
}

// --- STUDENT DASHBOARD LOGIC ---
function initializeStudentDashboard(userId) {
    const studentDocRef = doc(db, "classroom-rewards/main-class/students", userId);
    studentDataUnsubscribe = onSnapshot(studentDocRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            document.getElementById('student-name').textContent = data.name;
            document.getElementById('student-xp').textContent = data.xp;
            document.getElementById('student-money').textContent = data.money.toFixed(2);
            document.getElementById('student-level').textContent = calculateLevel(data.xp);
            // CHANGE: Call function to display black marks
            displayBlackMarks(data.blackMarks);
        } else {
            console.log("Student document does not exist.");
            signOut(auth);
        }
    });
    loadShop();
    loadClassRanking(userId, 'xp');
    const rankingSelect = document.getElementById('ranking-criteria');
    if (rankingSelect) {
        rankingSelect.addEventListener('change', (e) => {
            loadClassRanking(userId, e.target.value);
        });
    }
}

// CHANGE: New function to display black marks
function displayBlackMarks(blackMarks) {
    const blackMarksTableBody = document.querySelector("#black-marks-table tbody");
    const noBlackMarksMessage = document.getElementById('no-black-marks-message');
    const blackMarksTable = document.getElementById('black-marks-table');

    blackMarksTableBody.innerHTML = ''; // Clear previous entries

    if (!blackMarks || blackMarks.length === 0) {
        noBlackMarksMessage.style.display = 'block';
        blackMarksTable.style.display = 'none';
        return;
    }

    noBlackMarksMessage.style.display = 'none';
    blackMarksTable.style.display = 'table';

    // Sort black marks by timestamp in descending order (most recent first)
    blackMarks.sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0; // Handle cases without timestamp
        return b.timestamp.toMillis() - a.timestamp.toMillis();
    });

    blackMarks.forEach(mark => {
        const row = blackMarksTableBody.insertRow();
        const date = mark.timestamp ? mark.timestamp.toDate().toLocaleString() : 'N/A';
        row.innerHTML = `<td>${mark.type}</td><td>${date}</td>`;
    });
}


function loadShop() {
    const shopCollectionRef = collection(db, "classroom-rewards/main-class/shop");
    const shopGrid = document.getElementById('shop-grid');
    onSnapshot(query(shopCollectionRef, orderBy("price")), (snapshot) => {
        shopGrid.innerHTML = '';
        if (snapshot.empty) {
            shopGrid.innerHTML = '<p>The shop is currently empty.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const item = doc.data();
            const itemId = doc.id;
            const itemElement = document.createElement('div');
            itemElement.className = 'shop-item';
            const descriptionHTML = item.description ? `<div class="item-description">${item.description}</div>` : '';
            itemElement.innerHTML = `
                <div>
                    <strong>${item.name}</strong>
                    ${descriptionHTML}
                </div>
                <div class="shop-item-actions">
                    <span>$${item.price.toFixed(2)}</span>
                    <button class="buy-button" data-id="${itemId}" data-name="${item.name}" data-price="${item.price}">Buy</button>
                </div>
            `;
            shopGrid.appendChild(itemElement); // Corrected: app.js was cut off here
        });
    });
}

async function handlePurchase(itemId, itemName, itemPrice) {
    const user = auth.currentUser;
    if (!user) return;
    const price = parseFloat(itemPrice);
    const studentDocRef = doc(db, "classroom-rewards/main-class/students", user.uid);
    try {
        await runTransaction(db, async (transaction) => {
            const studentDoc = await transaction.get(studentDocRef);
            if (!studentDoc.exists()) { throw "Student document does not exist!"; }
            const currentMoney = studentDoc.data().money;
            if (currentMoney < price) { throw "You do not have enough money for this item."; }
            const newMoney = currentMoney - price;
            transaction.update(studentDocRef, { money: newMoney });
            const historyCollectionRef = collection(db, "classroom-rewards/main-class/purchase_history");
            const newHistoryRef = doc(historyCollectionRef);
            transaction.set(newHistoryRef, {
                studentId: user.uid,
                studentName: studentDoc.data().name,
                itemId: itemId,
                itemName: itemName,
                cost: price,
                timestamp: serverTimestamp()
            });
        });
        alert(`Purchase successful! You bought: ${itemName}`);
    } catch (e) {
        console.error("Transaction failed: ", e);
        alert("Purchase failed: " + e);
    }
}

function loadClassRanking(userId, criteria = 'xp') {
    const tableBody = document.querySelector('#ranking-table tbody');
    if (!tableBody) return;
    const studentsRef = collection(db, "classroom-rewards/main-class/students");
    const orderField = criteria === 'money' ? 'money' : 'xp';
    const q = query(studentsRef, orderBy(orderField, 'desc'));
    onSnapshot(q, (snapshot) => {
        tableBody.innerHTML = '';
        let rank = 1;
        snapshot.forEach((docSnap) => {
            const student = docSnap.data();
            const row = tableBody.insertRow();
            if (docSnap.id === userId) {
                row.style.fontWeight = 'bold';
                row.style.backgroundColor = '#dfeaf4';
            }
            const moneyValue = typeof student.money === 'number' ? student.money.toFixed(2) : '0.00';
            row.innerHTML = `<td>${rank}</td><td>${student.name || 'Unknown'}</td><td>${student.xp ?? 0}</td><td>$${moneyValue}</td>`;
            rank++;
        });
    });
}

// --- EVENT LISTENERS ---
document.getElementById('show-register').addEventListener('click', () => {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('register-container').style.display = 'block';
});
document.getElementById('show-login').addEventListener('click', () => {
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('register-container').style.display = 'none';
});
document.getElementById('login-button').addEventListener('click', () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorElem = document.getElementById('login-error');
    errorElem.textContent = '';
    signInWithEmailAndPassword(auth, email, password)
     .catch(error => {
            console.error("Login Error:", error);
            errorElem.textContent = error.message;
        });
});
document.getElementById('register-button').addEventListener('click', async () => {
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const errorElem = document.getElementById('register-error');
    errorElem.textContent = '';
    if (!name) { errorElem.textContent = "Please enter your name."; return; }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const studentDocRef = doc(db, "classroom-rewards/main-class/students", user.uid);
        // CHANGE: Initialize blackMarks as an empty array for new students
        await setDoc(studentDocRef, { name: name, email: email, xp: 0, money: 0, blackMarks: [] });
    } catch (error) {
        console.error("Registration Error:", error);
        errorElem.textContent = error.message;
    }
});
document.getElementById('logout-button').addEventListener('click', () => {
    signOut(auth);
});
document.getElementById('dashboard-view').addEventListener('click', (e) => {
    if (e.target.classList.contains('buy-button')) {
        const button = e.target;
        handlePurchase(button.dataset.id, button.dataset.name, button.dataset.price);
    }
});

// --- Modal Logic ---
const modal = document.getElementById('level-up-modal');
const infoButton = document.getElementById('level-info-button');
const closeButton = document.querySelector('.close-button');

infoButton.onclick = function() {
    const tableBody = document.querySelector('#level-up-table tbody');
    tableBody.innerHTML = '';
    levelThresholds.forEach(lt => {
        const row = tableBody.insertRow();
        // For display, Level 1 needs 0 XP, Level 2 needs 100, etc.
        row.innerHTML = `<td>${lt.level}</td><td>${lt.xp}</td>`;
    });
    modal.style.display = "block";
}

closeButton.onclick = function() {
    modal.style.display = "none";
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}
