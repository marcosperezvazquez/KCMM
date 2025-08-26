// admin.js - For Teacher Portal (admin.html)

// --- IMPORTS ---
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    onSnapshot,
    collection,
    addDoc,
    query,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    orderBy,
    initializeFirestore // RESTORED: Using original initialization method
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// RESTORED: Using the original, working database initialization
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const TEACHER_EMAIL = "teacher@example.com";

// --- Leveling System Configuration ---
function calculateLevel(xp) {
    if (xp < 0) return 1;
    const level = Math.floor(xp / 100) + 1;
    return level > 10 ? 10 : level; // Cap at level 10
}


// --- AUTHENTICATION LOGIC ---
onAuthStateChanged(auth, user => {
    if (user && user.email === TEACHER_EMAIL) {
        showAdminPanel();
        initializeAdminDashboard();
    } else {
        showAuthView();
    }
});

// --- UI TOGGLING FUNCTIONS ---
function showAuthView() {
    document.getElementById('auth-view').style.display = 'block';
    document.getElementById('admin-panel-view').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('admin-panel-view').style.display = 'block';
}

// --- ADMIN DASHBOARD LOGIC ---
let allStudentsData = {};

function initializeAdminDashboard() {
    loadAllStudents();
    loadAdminShopManagement();
    loadFullPurchaseHistory();
    // ADDED: Load notifications
    loadNotifications();
}

// --- ADDED: Notifications Feature ---
function loadNotifications() {
    const notificationsRef = collection(db, "classroom-rewards/main-class/notifications");
    const q = query(notificationsRef, orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        const notificationsList = document.getElementById("notifications-list");
        const notificationBadge = document.getElementById("notification-badge");
        if (!notificationsList || !notificationBadge) return;

        notificationsList.innerHTML = "";
        let unreadCount = 0;

        snapshot.forEach(doc => {
            const notification = doc.data();
            const li = document.createElement("li");
            const date = notification.timestamp ? notification.timestamp.toDate().toLocaleString() : 'Just now';
            li.innerHTML = `<strong>${notification.studentName}</strong> purchased <em>${notification.itemName}</em> for ${notification.itemPrice} coins. <span class="timestamp">${date}</span>`;
            if (!notification.read) {
                li.classList.add("unread");
                unreadCount++;
            }
            notificationsList.appendChild(li);
        });

        if (unreadCount > 0) {
            notificationBadge.textContent = unreadCount;
            notificationBadge.style.display = "flex";
        } else {
            notificationBadge.style.display = "none";
        }
    });

    document.getElementById('notification-area').addEventListener('click', () => {
        const notificationsRef = collection(db, "classroom-rewards/main-class/notifications");
        const q = query(notificationsRef, orderBy("timestamp", "desc"));
        onSnapshot(q, (snapshot) => {
            snapshot.docs.forEach(async (document) => {
                if (!document.data().read) {
                    const docRef = doc(db, "classroom-rewards/main-class/notifications", document.id);
                    await updateDoc(docRef, { read: true });
                }
            });
        }, { once: true }); // Use once to avoid continuous listeners
    });
}


// --- STUDENT MANAGEMENT (Original working code) ---
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
                <td><input type="checkbox" class="student-select-checkbox" data-id="${studentId}"></td>
                <td>${student.name}</td><td>${student.email}</td>
                <td>${calculateLevel(student.xp)}</td>
                <td><input type="number" value="${student.xp}" class="student-xp-input" data-id="${studentId}"></td>
                <td><input type="number" value="${student.money}" step="0.01" class="student-money-input" data-id="${studentId}"></td>
                <td>
                    <button class="update-student-button" data-id="${studentId}">Update</button>
                    <button class="delete-student-button" data-id="${studentId}" data-name="${student.name}" style="background-color: #e74c3c;">Delete</button>
                </td>
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
        await updateDoc(studentDocRef, {
            xp: newXp,
            money: newMoney
        });
        console.log("Student updated successfully.");
    } catch (error) {
        console.error("Error updating student: ", error);
        alert("Failed to update student.");
    }
}

async function handleDeleteStudent(studentId, studentName) {
    if (confirm(`Are you sure you want to delete the student: ${studentName}? This action cannot be undone.`)) {
        const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
        try {
            await deleteDoc(studentDocRef);
            console.log("Student deleted successfully.");
        } catch (error) {
            console.error("Error deleting student: ", error);
            alert("Failed to delete student.");
        }
    }
}

// --- SHOP MANAGEMENT (Original working code) ---
let currentEditItemId = null;

function loadAdminShopManagement() {
    const shopCollectionRef = collection(db, "classroom-rewards/main-class/shop-items");
    const shopTableBody = document.querySelector("#shop-table tbody");
    onSnapshot(shopCollectionRef, (snapshot) => {
        shopTableBody.innerHTML = "";
        snapshot.forEach(doc => {
            const item = doc.data();
            const row = shopTableBody.insertRow();
            row.innerHTML = `
                <td>${item.name}</td>
                <td>${item.description}</td>
                <td>${item.price}</td>
                <td>
                    <button class="edit-item-button" data-id="${doc.id}" data-name="${item.name}" data-price="${item.price}" data-description="${item.description}">Edit</button>
                    <button class="delete-item-button" data-id="${doc.id}" style="background-color: #e74c3c;">Delete</button>
                </td>
            `;
        });
    });
}

async function handleSaveShopItem() {
    const name = document.getElementById('item-name').value;
    const description = document.getElementById('item-description').value;
    const price = parseFloat(document.getElementById('item-price').value);

    if (!name || !description || isNaN(price) || price < 0) {
        alert("Please fill in all fields with valid data.");
        return;
    }

    if (currentEditItemId) {
        const itemDocRef = doc(db, "classroom-rewards/main-class/shop-items", currentEditItemId);
        try {
            await updateDoc(itemDocRef, { name, description, price });
            console.log("Item updated successfully.");
        } catch (error) {
            console.error("Error updating item: ", error);
        }
    } else {
        const shopCollectionRef = collection(db, "classroom-rewards/main-class/shop-items");
        try {
            await addDoc(shopCollectionRef, { name, description, price });
            console.log("Item added successfully.");
        } catch (error) {
            console.error("Error adding item: ", error);
        }
    }
    resetShopForm();
}

function populateShopFormForEdit(id, name, price, description) {
    currentEditItemId = id;
    document.getElementById('edit-item-id').value = id;
    document.getElementById('item-name').value = name;
    document.getElementById('item-description').value = description;
    document.getElementById('item-price').value = price;
    document.getElementById('save-item-button').textContent = "Update Item";
    document.getElementById('cancel-edit-button').style.display = "inline-block";
}

function resetShopForm() {
    currentEditItemId = null;
    document.getElementById('edit-item-id').value = "";
    document.getElementById('item-name').value = "";
    document.getElementById('item-description').value = "";
    document.getElementById('item-price').value = "";
    document.getElementById('save-item-button').textContent = "Save Item";
    document.getElementById('cancel-edit-button').style.display = "none";
}

async function handleDeleteShopItem(itemId) {
    if (confirm("Are you sure you want to delete this shop item?")) {
        const itemDocRef = doc(db, "classroom-rewards/main-class/shop-items", itemId);
        try {
            await deleteDoc(itemDocRef);
            console.log("Item deleted successfully.");
        } catch (error) {
            console.error("Error deleting item: ", error);
        }
    }
}

// --- PURCHASE HISTORY (Original working code) ---
function loadFullPurchaseHistory() {
    const historyCollectionRef = collection(db, "classroom-rewards/main-class/purchase-history");
    const q = query(historyCollectionRef, orderBy("timestamp", "desc"));
    const historyTableBody = document.querySelector("#full-purchase-history-table tbody");

    onSnapshot(q, (snapshot) => {
        historyTableBody.innerHTML = "";
        snapshot.forEach(doc => {
            const record = doc.data();
            const studentName = allStudentsData[record.studentId] ? allStudentsData[record.studentId].name : 'Unknown';
            const date = record.timestamp ? record.timestamp.toDate().toLocaleString() : 'N/A';
            const row = historyTableBody.insertRow();
            row.innerHTML = `
                <td>${studentName}</td>
                <td>${record.itemName}</td>
                <td>${record.itemPrice}</td>
                <td>${date}</td>
            `;
        });
    });
}

// --- AWARDING XP ---
async function awardXpToSelected(amount) {
    const checkboxes = document.querySelectorAll('.student-select-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Please select at least one student.");
        return;
    }

    for (const checkbox of checkboxes) {
        const studentId = checkbox.dataset.id;
        const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
        const currentXp = allStudentsData[studentId].xp;
        try {
            await updateDoc(studentDocRef, {
                xp: currentXp + amount
            });
        } catch (error) {
            console.error(`Error awarding XP to ${studentId}:`, error);
        }
    }
    console.log(`Awarded ${amount} XP to ${checkboxes.length} students.`);
}


// --- EVENT LISTENERS ---
document.getElementById('login-button').addEventListener('click', () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorElem = document.getElementById('login-error');
    if (email !== TEACHER_EMAIL) {
        errorElem.textContent = "Only the designated teacher can log in here.";
        return;
    }
    signInWithEmailAndPassword(auth, email, password)
        .catch(error => {
            errorElem.textContent = error.message;
        });
});

document.getElementById('admin-logout-button').addEventListener('click', () => {
    signOut(auth);
});

document.getElementById('students-table').addEventListener('click', e => {
    if (e.target.classList.contains('update-student-button')) {
        handleStudentUpdate(e.target.dataset.id);
    }
    if (e.target.classList.contains('delete-student-button')) {
        handleDeleteStudent(e.target.dataset.id, e.target.dataset.name);
    }
});

document.getElementById('save-item-button').addEventListener('click', handleSaveShopItem);
document.getElementById('cancel-edit-button').addEventListener('click', resetShopForm);

document.getElementById('shop-table').addEventListener('click', e => {
    const target = e.target;
    if (target.classList.contains('edit-item-button')) {
        populateShopFormForEdit(target.dataset.id, target.dataset.name, target.dataset.price, target.dataset.description);
    }
    if (target.classList.contains('delete-item-button')) {
        handleDeleteShopItem(target.dataset.id);
    }
});

document.getElementById('award-xp-5').addEventListener('click', () => awardXpToSelected(5));
document.getElementById('award-xp-10').addEventListener('click', () => awardXpToSelected(10));
document.getElementById('award-xp-20').addEventListener('click', () => awardXpToSelected(20));

document.getElementById('select-all-students').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.student-select-checkbox');
    const isAllSelected = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !isAllSelected);
    document.getElementById('select-all-checkbox-header').checked = !isAllSelected;
});

document.getElementById('select-all-checkbox-header').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.student-select-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
});
