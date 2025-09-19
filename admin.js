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
    where,
    arrayUnion,
    writeBatch,
    getDocs,
    initializeFirestore
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const TEACHER_EMAIL = "marcosperez@kcis.com.tw";

// --- (calculateLevel function remains the same) ---
function calculateLevel(xp) {
    if (xp < 0) return 1;
    const level = Math.floor(xp / 100) + 1;
    return level > 10 ? 10 : level; // Cap at level 10
}


// --- AUTHENTICATION LOGIC ---
let notificationsUnsubscribe = null;
let studentsUnsubscribe = null; // CHANGE: To manage the student listener

onAuthStateChanged(auth, user => {
    if (user && user.email === TEACHER_EMAIL) {
        showAdminPanel();
        initializeAdminDashboard(user.uid);
    } else {
        showAuthView();
        if (notificationsUnsubscribe) notificationsUnsubscribe();
        if (studentsUnsubscribe) studentsUnsubscribe(); // CHANGE: Unsubscribe on logout
    }
});

// --- (UI Toggling Functions remain the same) ---
// ...

// --- ADMIN DASHBOARD LOGIC ---
let allStudentsData = {};
let unreadNotifications = [];

function initializeAdminDashboard(teacherId) {
    // CHANGE: Initial sort is by name
    loadAllStudents('name', 'asc'); 
    
    // CHANGE: Add event listener for the new sorting dropdown
    document.getElementById('sort-students-by').addEventListener('change', (e) => {
        const sortBy = e.target.value;
        const direction = (sortBy === 'name' || sortBy === 'className') ? 'asc' : 'desc';
        loadAllStudents(sortBy, direction);
    });

    loadAdminShopManagement();
    loadFullPurchaseHistory();
    listenForNotifications(teacherId);
}

// CHANGE: Overhauled function to handle dynamic sorting
function loadAllStudents(sortBy = 'name', direction = 'asc') {
    // If there's an existing listener, unsubscribe from it to prevent multiple listeners
    if (studentsUnsubscribe) {
        studentsUnsubscribe();
    }

    const studentsCollectionRef = collection(db, "classroom-rewards/main-class/students");
    const studentsTableBody = document.querySelector("#students-table tbody");
    
    const q = query(studentsCollectionRef, orderBy(sortBy, direction));

    studentsUnsubscribe = onSnapshot(q, (snapshot) => {
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
                <td><input type="text" value="${student.className || ''}" class="student-class-input" data-id="${studentId}" placeholder="No class"></td>
                <td>
                    <button class="update-student-button" data-id="${studentId}">Update</button>
                    <button class="delete-student-button" data-id="${studentId}" data-name="${student.name}" style="background-color: #e74c3c;">Delete</button>
                </td>
            `;
        });
    });
}

// CHANGE: Upgraded function to also update the className
async function handleStudentUpdate(studentId) {
    const xpInput = document.querySelector(`.student-xp-input[data-id="${studentId}"]`);
    const moneyInput = document.querySelector(`.student-money-input[data-id="${studentId}"]`);
    const classInput = document.querySelector(`.student-class-input[data-id="${studentId}"]`); // Get class input

    const newXp = parseInt(xpInput.value, 10);
    const newMoney = parseFloat(moneyInput.value);
    const newClass = classInput.value.trim(); // Get class value

    if (isNaN(newXp) || isNaN(newMoney)) {
        alert("Invalid input. Please enter valid numbers for XP and Money.");
        return;
    }

    const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
    try {
        await updateDoc(studentDocRef, { 
            xp: newXp, 
            money: newMoney,
            className: newClass // Add className to the update object
        });
        alert("Student updated successfully!");
    } catch (error) {
        console.error("Error updating student:", error);
        alert("Failed to update student. See console for details.");
    }
}


// --- (All other functions from handleDeleteStudent to the end remain the same) ---
// ...    } catch (error) {
        console.error("Error updating student:", error);
        alert("Failed to update student. See console for details.");
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
    const batch = writeBatch(db);
    const notificationsCollectionRef = collection(db, "notifications");

    for (const checkbox of checkboxes) {
        const studentId = checkbox.dataset.id;
        const currentData = allStudentsData[studentId];
        if (!currentData) continue;

        const markData = {
            type: blackMarkType,
            timestamp: new Date()
        };

        const studentDocRef = doc(db, "classroom-rewards/main-class/students", studentId);
        batch.update(studentDocRef, { blackMarks: arrayUnion(markData) });

        const notificationDocRef = doc(notificationsCollectionRef);
        batch.set(notificationDocRef, {
            recipientId: studentId,
            message: `You received a black mark: "${blackMarkType}".`,
            timestamp: serverTimestamp(),
            read: false,
            type: 'black_mark'
        });
        
        awardedCount++;
    }

    try {
        await batch.commit();
        checkboxes.forEach(cb => cb.checked = false);
        if (awardedCount > 0) {
            const plural = awardedCount === 1 ? '' : 's';
            alert(`Successfully awarded "${blackMarkType}" black mark to ${awardedCount} student${plural}.`);
        }
    } catch (error) {
        console.error('Error awarding black mark and sending notifications:', error);
        alert('Failed to award black mark. See console for details.');
    }
}

// --- Notification Functions ---
function listenForNotifications(teacherId) {
    const notificationsQuery = query(
        collection(db, "notifications"),
        where("recipientId", "==", teacherId),
        orderBy("timestamp", "desc")
    );

    notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const panel = document.getElementById('notification-panel');
        const badge = document.getElementById('notification-badge');
        panel.innerHTML = '';
        unreadNotifications = [];

        if (snapshot.empty) {
            panel.innerHTML = '<p>No new notifications.</p>';
        } else {
            snapshot.forEach(doc => {
                const notification = doc.data();
                const notificationId = doc.id;
                if (!notification.read) {
                    unreadNotifications.push(notificationId);
                }
                const item = document.createElement('div');
                item.className = 'notification-item' + (notification.read ? '' : ' unread');
                item.innerHTML = `
                    ${notification.message}
                    <small>${notification.timestamp ? notification.timestamp.toDate().toLocaleString() : ''}</small>
                `;
                panel.appendChild(item);
            });
        }

        if (unreadNotifications.length > 0) {
            badge.textContent = unreadNotifications.length;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    });
}

async function markNotificationsAsRead() {
    if (unreadNotifications.length === 0) return;

    const batch = writeBatch(db);
    unreadNotifications.forEach(id => {
        const docRef = doc(db, "notifications", id);
        batch.update(docRef, { read: true });
    });
    await batch.commit();
    unreadNotifications = [];
}

// CHANGE: New Function to clear history for a new semester
async function handleClearHistory() {
    const confirmation = confirm("ARE YOU SURE?\nThis will permanently delete ALL purchase history and clear ALL black marks for every student.\n\nThis action cannot be undone.");

    if (!confirmation) {
        alert("Operation cancelled.");
        return;
    }

    alert("Starting the clearing process. This may take a moment...");

    try {
        // --- 1. Clear all black marks from students ---
        const studentsCollectionRef = collection(db, "classroom-rewards/main-class/students");
        const blackMarksBatch = writeBatch(db);
        for (const studentId in allStudentsData) {
            // We only want to clear for actual students, not the teacher document
            if (allStudentsData[studentId].email !== TEACHER_EMAIL) {
                const studentDocRef = doc(studentsCollectionRef, studentId);
                blackMarksBatch.update(studentDocRef, { blackMarks: [] });
            }
        }
        await blackMarksBatch.commit();
        console.log("All student black marks have been cleared.");

        // --- 2. Delete all documents from purchase_history ---
        const historyCollectionRef = collection(db, "classroom-rewards/main-class/purchase_history");
        const historySnapshot = await getDocs(historyCollectionRef);
        
        if (historySnapshot.empty) {
            console.log("Purchase history is already empty.");
        } else {
            // Firestore batches have a 500 operation limit. We'll handle larger histories by creating multiple batches.
            let deleteBatch = writeBatch(db);
            let operationCount = 0;
            for (const doc of historySnapshot.docs) {
                deleteBatch.delete(doc.ref);
                operationCount++;
                if (operationCount === 499) {
                    await deleteBatch.commit();
                    deleteBatch = writeBatch(db); // Start a new batch
                    operationCount = 0;
                }
            }
            if (operationCount > 0) {
                await deleteBatch.commit(); // Commit the final batch
            }
            console.log("All purchase history has been deleted.");
        }

        alert("SUCCESS: All purchase history and student black marks have been cleared.");
        
    } catch (error) {
        console.error("Error clearing history:", error);
        alert("An error occurred while clearing history. Check the console for details.");
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

document.getElementById('award-black-mark-button').addEventListener('click', awardBlackMarkToSelected);


document.getElementById('select-all-students').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.student-select-checkbox');
    Array.from(checkboxes).forEach(cb => {
        cb.checked = true;
    });
});

document.getElementById('notification-bell').addEventListener('click', () => {
    const panel = document.getElementById('notification-panel');
    const isVisible = panel.style.display === 'block';
    panel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible && unreadNotifications.length > 0) {
        markNotificationsAsRead();
    }
});

// CHANGE: Add event listener for the new clear history button
document.getElementById('clear-history-button').addEventListener('click', handleClearHistory);
