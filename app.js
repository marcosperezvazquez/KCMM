// app.js

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
    getDoc,
    onSnapshot,
    collection,
    addDoc,
    query,
    where,
    runTransaction,
    updateDoc,
    deleteDoc,
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
    const onAdminPage = document.getElementById('admin-panel-view');

    if (user) {
        // User is signed in.
        if (onAdminPage) {
            if (user.email === TEACHER_EMAIL) {
                showAdminPanel();
                initializeAdminDashboard();
            } else {
                // A student is trying to access the admin page.
                showAccessDenied();
            }
        } else {
            // We are on the student page (index.html).
            showDashboard();
            initializeStudentDashboard(user.uid);
        }
    } else {
        // User is signed out.
        if (onAdminPage) {
            // The listener no longer redirects. It just shows the access denied view.
            // The logout button's logic will handle the redirect.
            showAccessDenied();
        } else {
            // Show the login/register forms on the student page.
            showAuthView();
            if (studentDataUnsubscribe) {
                studentDataUnsubscribe();
            }
        }
    }
});

// --- UI TOGGLING FUNCTIONS ---
function showAuthView() {
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');
    if (authView) authView.style.display = 'block';
    if (dashboardView) dashboardView.style.display = 'none';
}

function showDashboard() {
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');
    if (authView) authView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
}

function showAdminPanel() {
    const adminPanelView = document.getElementById('admin-panel-view');
    const accessDeniedView = document.getElementById('access-denied-view');
    if (adminPanelView) adminPanelView.style.display = 'block';
    if (accessDeniedView) accessDeniedView.style.display = 'none';
}

function showAccessDenied() {
    const adminPanelView = document.getElementById('admin-panel-view');
    const accessDeniedView = document.getElementById('access-denied-view');
    if (adminPanelView) adminPanelView.style.display = 'none';
    if (accessDeniedView) accessDeniedView.style.display = 'block';
}


// --- STUDENT PORTAL LOGIC (index.html) ---

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
    loadStudentPurchaseHistory(userId);
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
    });
}

// --- EVENT LISTENERS for index.html ---
if (document.getElementById('login-button')) {
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
}

// --- ADMIN PORTAL LOGIC (admin.html) ---
let allStudentsData = {};

function initializeAdminDashboard() {
    loadAllStudents();
    loadAdminShopManagement();
    loadFullPurchaseHistory();
}

function loadAllStudents() {
    const studentsCollectionRef = collection(db, "classroom-rewards/main-class/students");
    const studentsTableBody = document.querySelector("#students-table tbody");
    onSnapshot(studentsCollectionRef, (snapshot) => {
        studentsTableBody.innerHTML = "";
        allStudentsData = {};
        snapshot.forEach(doc => {
            const student = doc.data();
            const studentId = doc.id;
            allStudentsData[studentId] = student;
            const row = studentsTableBody.insertRow();
            row.innerHTML = `
                <td>${student.name}</td><td>${student.email}</td>
                <td><input type="number" value="${student.xp}" class="student-xp-input" data-id="${studentId}"></td>
                <td><input type="number" value="${student.money}" step="0.01" class="student-money-input" data-id="${studentId}"></td>
                <td><button class="update-student-button" data-id="${studentId}">Update</button></td>
            `;
        });
    });
}

async function handleStudentUpdate(studentId) {
    const xpInput = document.querySelector(`.student-xp-input[data-id="${studentId}"]`);
    const moneyInput = document.querySelector(`.student-money-input[data-id="${studentId}"]`);
    const newXp = parseInt(xpInput.value, 10);
    const newMoney = parseFloat(moneyInput.value);
    if (isNaN(newXp) || isNaN(newMoney)) {
        alert("Invalid input. Please enter valid numbers for XP and Money.");
        return;
    }
    const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
    try {
        await updateDoc(studentDocRef, { xp: newXp, money: newMoney });
        alert("Student updated successfully!");
    } catch (error) {
        console.error("Error updating student:", error);
        alert("Failed to update student. See console for details.");
    }
}

function loadAdminShopManagement() {
    const shopCollectionRef = collection(db, "classroom-rewards/main-class/shop");
    const shopTableBody = document.querySelector("#shop-table tbody");
    onSnapshot(query(shopCollectionRef, orderBy("name")), (snapshot) => {
        shopTableBody.innerHTML = "";
        snapshot.forEach(doc => {
            const item = doc.data();
            const itemId = doc.id;
            const row = shopTableBody.insertRow();
            row.innerHTML = `
                <td>${item.name}</td><td>$${item.price.toFixed(2)}</td>
                <td>
                    <button class="edit-item-button" data-id="${itemId}" data-name="${item.name}" data-price="${item.price}">Edit</button>
                    <button class="delete-item-button" data-id="${itemId}" style="background-color: #e74c3c;">Delete</button>
                </td>
            `;
        });
    });
}

async function handleSaveShopItem() {
    const name = document.getElementById('item-name').value;
    const price = parseFloat(document.getElementById('item-price').value);
    const editingId = document.getElementById('edit-item-id').value;
    if (!name || isNaN(price) || price < 0) {
        alert("Please enter a valid name and a non-negative price.");
        return;
    }
    const itemData = { name, price };
    try {
        if (editingId) {
            const itemDocRef = doc(db, "classroom-rewards/main-class/shop", editingId);
            await updateDoc(itemDocRef, itemData);
            alert("Item updated successfully!");
        } else {
            const shopCollectionRef = collection(db, "classroom-rewards/main-class/shop");
            await addDoc(shopCollectionRef, itemData);
            alert("Item added successfully!");
        }
        resetShopForm();
    } catch (error) {
        console.error("Error saving shop item:", error);
        alert("Failed to save item. See console for details.");
    }
}

async function handleDeleteShopItem(itemId) {
    if (!confirm("Are you sure you want to delete this item?")) return;
    const itemDocRef = doc(db, "classroom-rewards/main-class/shop", itemId);
    try {
        await deleteDoc(itemDocRef);
        alert("Item deleted successfully.");
    } catch (error) {
        console.error("Error deleting item:", error);
        alert("Failed to delete item.");
    }
}

function populateShopFormForEdit(id, name, price) {
    document.getElementById('edit-item-id').value = id;
    document.getElementById('item-name').value = name;
    document.getElementById('item-price').value = price;
    document.getElementById('cancel-edit-button').style.display = 'inline-block';
}

function resetShopForm() {
    document.getElementById('edit-item-id').value = '';
    document.getElementById('item-name').value = '';
    document.getElementById('item-price').value = '';
    document.getElementById('cancel-edit-button').style.display = 'none';
}

function loadFullPurchaseHistory() {
    const historyTableBody = document.querySelector("#full-purchase-history-table tbody");
    const q = query(
        collection(db, "classroom-rewards/main-class/purchase_history"),
        orderBy("timestamp", "desc")
    );
    onSnapshot(q, (snapshot) => {
        historyTableBody.innerHTML = "";
        snapshot.forEach(doc => {
            const purchase = doc.data();
            const studentName = allStudentsData[purchase.studentId]?.name || purchase.studentName || 'Unknown Student';
            const date = purchase.timestamp? purchase.timestamp.toDate().toLocaleString() : 'N/A';
            const row = historyTableBody.insertRow();
            row.innerHTML = `
                <td>${studentName}</td><td>${purchase.itemName}</td>
                <td>$${purchase.cost.toFixed(2)}</td><td>${date}</td>
            `;
        });
    });
}

// --- EVENT LISTENERS for admin.html ---
if (document.getElementById('admin-panel-view')) {
    document.getElementById('admin-logout-button').addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            console.error('Sign out error', error);
        });
    });

    document.getElementById('students-table').addEventListener('click', e => {
        if (e.target.classList.contains('update-student-button')) {
            handleStudentUpdate(e.target.dataset.id);
        }
    });

    document.getElementById('save-item-button').addEventListener('click', handleSaveShopItem);
    document.getElementById('cancel-edit-button').addEventListener('click', resetShopForm);

    document.getElementById('shop-table').addEventListener('click', e => {
        const target = e.target;
        if (target.classList.contains('edit-item-button')) {
            populateShopFormForEdit(target.dataset.id, target.dataset.name, target.dataset.price);
        }
        if (target.classList.contains('delete-item-button')) {
            handleDeleteShopItem(target.dataset.id);
        }
    });
}
