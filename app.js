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
    orderBy
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TEACHER_EMAIL = "teacher@example.com";

// --- GLOBAL STATE ---
let studentDataUnsubscribe = null;

// --- AUTHENTICATION LOGIC ---
onAuthStateChanged(auth, user => {
    if (user) {
        // If a teacher accidentally logs in here, log them out and redirect.
        if (user.email === TEACHER_EMAIL) {
            signOut(auth);
            // This will re-trigger onAuthStateChanged, showing the login form.
            return;
        }
        // A student is signed in.
        showDashboard();
        initializeStudentDashboard(user.uid);
    } else {
        // User is signed out.
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
        } else {
            console.log("Student document does not exist.");
            signOut(auth);
        }
    });
    loadShop();
    // Load class ranking (default sorted by XP) and set up listener for dropdown changes
    loadClassRanking(userId, 'xp');
    const rankingSelect = document.getElementById('ranking-criteria');
    if (rankingSelect) {
        rankingSelect.addEventListener('change', (e) => {
            loadClassRanking(userId, e.target.value);
        });
    }
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
            itemElement.innerHTML = `
                <div><strong>${item.name}</strong></div>
                <div>
                    <span>$${item.price.toFixed(2)}</span>
                    <button class="buy-button" data-id="${itemId}" data-name="${item.name}" data-price="${item.price}">Buy</button>
                </div>
            `;
            shopGrid.appendChild(itemElement);
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

function loadStudentPurchaseHistory(userId) {
    const historyTableBody = document.querySelector("#purchase-history-table tbody");
    const q = query(
        collection(db, "classroom-rewards/main-class/purchase_history"),
        where("studentId", "==", userId),
        orderBy("timestamp", "desc")
    );
    onSnapshot(q, (snapshot) => {
        historyTableBody.innerHTML = "";
        snapshot.forEach(doc => {
            const purchase = doc.data();
            const date = purchase.timestamp? purchase.timestamp.toDate().toLocaleDateString() : 'N/A';
            const row = historyTableBody.insertRow();
            row.innerHTML = `<td>${purchase.itemName}</td><td>$${purchase.cost.toFixed(2)}</td><td>${date}</td>`;
        });
    }, (error) => {
        // This error handler is important for the index creation.
        console.error("Error fetching purchase history: ", error);
        historyTableBody.innerHTML = `<tr><td colspan="3">Could not load purchase history. A database index might be required.</td></tr>`;
    });
}

// Function to load and display the class ranking. It sorts all students
// by the selected criterion (either 'xp' or 'money') in descending order.
// The logged‑in student's row is highlighted.
function loadClassRanking(userId, criteria = 'xp') {
    const tableBody = document.querySelector('#ranking-table tbody');
    if (!tableBody) return;
    const studentsRef = collection(db, "classroom-rewards/main-class/students");
    const orderField = criteria === 'money' ? 'money' : 'xp';
    const q = query(studentsRef, orderBy(orderField, 'desc'));
    onSnapshot(q, (snapshot) => {
        tableBody.innerHTML = '';
        let rank = 1;
        snapshot.forEach((doc) => {
            const student = doc.data();
            const row = tableBody.insertRow();
            // Highlight the current student's row
            if (doc.id === userId) {
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
