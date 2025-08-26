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
    getFirestore, // CORRECTED: Using getFirestore
    doc,
    setDoc,
    onSnapshot,
    collection,
    addDoc,
    query,
    where,
    runTransaction,
    serverTimestamp,
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // CORRECTED: Reverted to standard getFirestore initialization

const TEACHER_EMAIL = "teacher@example.com";
let studentDataUnsubscribe = null;
let currentStudentData = {};

// --- Leveling System Configuration (100xp intervals) ---
const levelThresholds = Array.from({ length: 10 }, (_, i) => ({
    level: i + 1,
    xp: i * 100
}));

function calculateLevel(xp) {
    if (xp < 0) return 1;
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
            currentStudentData = data;
            document.getElementById('student-name').textContent = data.name;
            document.getElementById('student-xp').textContent = data.xp;
            document.getElementById('student-money').textContent = data.money.toFixed(2);
            document.getElementById('student-level').textContent = calculateLevel(data.xp);
        } else {
            console.log("Student document does not exist.");
            signOut(auth);
        }
    });
    loadShop();
    loadClassRanking(userId, 'xp');

    document.getElementById('ranking-criteria').addEventListener('change', (e) => {
        loadClassRanking(userId, e.target.value);
    });
}

function loadShop() {
    const shopCollectionRef = collection(db, "classroom-rewards/main-class/shop-items");
    const shopContainer = document.getElementById('shop-items-container');
    onSnapshot(shopCollectionRef, (snapshot) => {
        shopContainer.innerHTML = "";
        snapshot.forEach(doc => {
            const item = doc.data();
            const itemDiv = document.createElement('div');
            itemDiv.className = 'shop-item';
            itemDiv.innerHTML = `
                <div class="shop-item-details">
                    <strong>${item.name}</strong>
                    <p class="item-description">${item.description}</p>
                </div>
                <div class="shop-item-actions">
                    <span>${item.price}</span>
                    <button class="buy-button" data-id="${doc.id}" data-name="${item.name}" data-price="${item.price}">Buy</button>
                </div>
            `;
            shopContainer.appendChild(itemDiv);
        });
    });
}

// CORRECTED: Rewrote purchase logic for stability
async function handlePurchase(itemId, itemName, itemPrice) {
    const price = parseFloat(itemPrice);
    const user = auth.currentUser;
    if (!user) return;

    if (currentStudentData.money < price) {
        alert("You don't have enough money to buy this item.");
        return;
    }

    const studentDocRef = doc(db, "classroom-rewards/main-class/students", user.uid);
    const newHistoryDocRef = doc(collection(db, "classroom-rewards/main-class/purchase-history"));
    const notificationsCollectionRef = collection(db, "classroom-rewards/main-class/notifications");

    try {
        await runTransaction(db, async (transaction) => {
            const studentDoc = await transaction.get(studentDocRef);
            if (!studentDoc.exists()) {
                throw "Student document does not exist!";
            }

            const currentMoney = studentDoc.data().money;
            if (currentMoney < price) {
                throw "Insufficient funds.";
            }

            const newMoney = currentMoney - price;
            transaction.update(studentDocRef, { money: newMoney });
            transaction.set(newHistoryDocRef, {
                studentId: user.uid,
                itemName: itemName,
                itemPrice: price,
                timestamp: serverTimestamp()
            });
        });

        await addDoc(notificationsCollectionRef, {
            studentName: currentStudentData.name,
            itemName: itemName,
            itemPrice: price,
            timestamp: serverTimestamp(),
            read: false
        });

        console.log("Purchase successful and notification sent.");

    } catch (error) {
        console.error("Transaction failed: ", error);
        if (error === "Insufficient funds.") {
            alert("You don't have enough money to buy this item.");
        } else {
            alert("Purchase failed. Please try again.");
        }
    }
}


function loadClassRanking(currentUserId, criteria) {
    const studentsCollectionRef = collection(db, "classroom-rewards/main-class/students");
    const rankingTableBody = document.querySelector("#ranking-table tbody");

    onSnapshot(studentsCollectionRef, (snapshot) => {
        let students = [];
        snapshot.forEach(doc => {
            students.push({ id: doc.id, ...doc.data() });
        });

        students.sort((a, b) => b[criteria] - a[criteria]);

        rankingTableBody.innerHTML = "";
        students.forEach((student, index) => {
            const row = rankingTableBody.insertRow();
            if (student.id === currentUserId) {
                row.classList.add("current-user-rank");
            }
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${student.name}</td>
                <td>${student.xp}</td>
                <td>${student.money.toFixed(2)}</td>
            `;
        });
    });
}


// --- EVENT LISTENERS ---
document.getElementById('show-register').addEventListener('click', () => {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('register-container').style.display = 'block';
});

document.getElementById('show-login').addEventListener('click', () => {
    document.getElementById('register-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';
});

document.getElementById('login-button').addEventListener('click', () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorElem = document.getElementById('login-error');
    signInWithEmailAndPassword(auth, email, password)
        .catch(error => {
            errorElem.textContent = error.message;
        });
});

document.getElementById('register-button').addEventListener('click', async () => {
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const errorElem = document.getElementById('register-error');

    if (!name) {
        errorElem.textContent = "Please enter your name.";
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const studentDocRef = doc(db, "classroom-rewards/main-class/students", user.uid);
        await setDoc(studentDocRef, { name: name, email: email, xp: 0, money: 0 });
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
