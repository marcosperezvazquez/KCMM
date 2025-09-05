--- START OF FILE admin.js ---

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
    arrayUnion, // CHANGE: Added arrayUnion for adding black marks
    initializeFirestore
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const TEACHER_EMAIL = "teacher@example.com";

// --- CHANGE: Leveling System Configuration (100xp intervals) ---
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
        await updateDoc(studentDocRef, { xp: newXp, money: newMoney });
        alert("Student updated successfully!");
    } catch (error) {
        console.error("Error updating student:", error);
        alert("Failed to update student. See console for details.");
    }
}

async function handleDeleteStudent(studentId, studentName) {
    if (!confirm(`Are you sure you want to delete the student "${studentName}"? This will delete their data permanently.`)) {
        return;
    }
    const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
    try {
        await deleteDoc(studentDocRef);
        alert(`Successfully deleted ${studentName}'s data.`);
    } catch (error) {
        console.error("Error deleting student data:", error);
        alert("Failed to delete student data. See console for details.");
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
                <td>${item.name}</td>
                <td>${item.description || ''}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>
                    <button class="edit-item-button" data-id="${itemId}" data-name="${item.name}" data-price="${item.price}" data-description="${item.description || ''}">Edit</button>
                    <button class="delete-item-button" data-id="${itemId}" style="background-color: #e74c3c;">Delete</button>
                </td>
            `;
        });
    });
}

async function handleSaveShopItem() {
    const name = document.getElementById('item-name').value;
    const price = parseFloat(document.getElementById('item-price').value);
    const description = document.getElementById('item-description').value;
    const editingId = document.getElementById('edit-item-id').value;

    if (!name || isNaN(price) || price < 0) {
        alert("Please enter a valid name and a non-negative price.");
        return;
    }
    const itemData = { name, price, description };
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

function populateShopFormForEdit(id, name, price, description) {
    document.getElementById('edit-item-id').value = id;
    document.getElementById('item-name').value = name;
    document.getElementById('item-price').value = price;
    document.getElementById('item-description').value = description;
    document.getElementById('cancel-edit-button').style.display = 'inline-block';
}

function resetShopForm() {
    document.getElementById('edit-item-id').value = '';
    document.getElementById('item-name').value = '';
    document.getElementById('item-description').value = '';
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

async function awardXpToSelected(amount) {
    const checkboxes = document.querySelectorAll('.student-select-checkbox:checked');
    if (!checkboxes.length) {
        alert('Please select at least one student to award XP.');
        return;
    }
    let awardedCount = 0;
    for (const checkbox of checkboxes) {
        const studentId = checkbox.dataset.id;
        const currentData = allStudentsData[studentId];
        if (!currentData) continue;
        const newXp = (currentData.xp || 0) + amount;
        const newMoney = (currentData.money || 0) + amount;
        const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
        try {
            await updateDoc(studentDocRef, { xp: newXp, money: newMoney });
            allStudentsData[studentId].xp = newXp;
            allStudentsData[studentId].money = newMoney;
            awardedCount++;
        } catch (error) {
            console.error('Error awarding XP to student', studentId, error);
            alert('Failed to award XP to ' + currentData.name + '. See console for details.');
        }
    }
    checkboxes.forEach(cb => cb.checked = false);
    if (awardedCount > 0) {
        const plural = awardedCount === 1 ? '' : 's';
        alert(`Successfully awarded +${amount} XP and $${amount} to ${awardedCount} student${plural}.`);
    }
}

// CHANGE: New function to award black marks
async function awardBlackMarkToSelected() {
    const checkboxes = document.querySelectorAll('.student-select-checkbox:checked');
    if (!checkboxes.length) {
        alert('Please select at least one student to award a black mark.');
        return;
    }

    const blackMarkType = document.getElementById('black-mark-type').value;
    if (!blackMarkType) {
        alert('Please select a type of black mark.');
        return;
    }

    let awardedCount = 0;
    const markData = {
        type: blackMarkType,
        timestamp: serverTimestamp()
    };

    for (const checkbox of checkboxes) {
        const studentId = checkbox.dataset.id;
        const currentData = allStudentsData[studentId];
        if (!currentData) continue;

        const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
        try {
            await updateDoc(studentDocRef, {
                blackMarks: arrayUnion(markData) // Use arrayUnion to add the new mark
            });
            // Update local data for immediate UI reflection (optional but good practice)
            if (!allStudentsData[studentId].blackMarks) {
                allStudentsData[studentId].blackMarks = [];
            }
            allStudentsData[studentId].blackMarks.push(markData);
            awardedCount++;
        } catch (error) {
            console.error('Error awarding black mark to student', studentId, error);
            alert('Failed to award black mark to ' + currentData.name + '. See console for details.');
        }
    }
    checkboxes.forEach(cb => cb.checked = false); // Deselect students
    if (awardedCount > 0) {
        const plural = awardedCount === 1 ? '' : 's';
        alert(`Successfully awarded "${blackMarkType}" black mark to ${awardedCount} student${plural}.`);
    }
}


// --- EVENT LISTENERS ---
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

// CHANGE: Event listener for awarding black marks
document.getElementById('award-black-mark-button').addEventListener('click', awardBlackMarkToSelected);


document.getElementById('select-all-students').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.student-select-checkbox');
    Array.from(checkboxes).forEach(cb => {
        cb.checked = true;
    });
});
