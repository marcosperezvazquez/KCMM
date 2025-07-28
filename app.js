// app.js

// --- IMPORTS ---
// Import functions from the Firebase SDKs
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
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// This is the hardcoded teacher email. It MUST match the one in the security rules.
const TEACHER_EMAIL = "teacher@example.com";

// --- GLOBAL STATE ---
// A variable to hold the unsubscribe function for the student listener
// to prevent memory leaks when the user logs out.
let studentDataUnsubscribe = null;

// --- AUTHENTICATION LOGIC ---
// This is the central function that listens for changes in the user's login state.
onAuthStateChanged(auth, user => {
    // Determine which page we are on by checking for a specific element's existence.
    const onAdminPage = document.getElementById('admin-panel-view');

    if (user) {
        // User is signed in.
        if (onAdminPage) {
            // We are on the admin page. Check if the user is the teacher.
            if (user.email === TEACHER_EMAIL) {
                showAdminPanel();
                initializeAdminDashboard();
            } else {
                // A non-teacher user is trying to access the admin page. Deny access.
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
            // If on admin page and logged out, redirect to student login.
            window.location.href = 'index.html';
        } else {
            // Show the login/register forms on the student page.
            showAuthView();
            // If there was an active listener, unsubscribe from it.
            if (studentDataUnsubscribe) {
                studentDataUnsubscribe();
            }
        }
    }
});

// --- UI TOGGLING FUNCTIONS ---
// These functions control which parts of the HTML are visible.
function showAuthView() {
    document.getElementById('auth-view').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
}

function showDashboard() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
}

function showAdminPanel() {
    document.getElementById('admin-panel-view').style.display = 'block';
    document.getElementById('access-denied-view').style.display = 'none';
}

function showAccessDenied() {
    document.getElementById('admin-panel-view').style.display = 'none';
    document.getElementById('access-denied-view').style.display = 'block';
}


// --- STUDENT PORTAL LOGIC (index.html) ---

// This function runs once a student logs in.
function initializeStudentDashboard(userId) {
    // Set up a real-time listener for the student's own data document.
    const studentDocRef = doc(db, "classroom-rewards/main-class/students", userId);

    studentDataUnsubscribe = onSnapshot(studentDocRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            document.getElementById('student-name').textContent = data.name;
            document.getElementById('student-xp').textContent = data.xp;
            document.getElementById('student-money').textContent = data.money.toFixed(2);
        } else {
            // This case might happen if the teacher deletes the student's record
            // while they are logged in.
            console.log("Student document does not exist.");
            // Log the user out for safety.
            signOut(auth);
        }
    });

    // Load the shop items.
    loadShop();

    // Load the student's personal purchase history.
    loadStudentPurchaseHistory(userId);
}

// Function to fetch and display shop items.
function loadShop() {
    const shopCollectionRef = collection(db, "classroom-rewards/main-class/shop");
    const shopGrid = document.getElementById('shop-grid');

    onSnapshot(query(shopCollectionRef, orderBy("price")), (snapshot) => {
        shopGrid.innerHTML = ''; // Clear existing items
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
                <div>
                    <strong>${item.name}</strong>
                </div>
                <div>
                    <span>$${item.price.toFixed(2)}</span>
                    <button class="buy-button" data-id="${itemId}" data-name="${item.name}" data-price="${item.price}">Buy</button>
                </div>
            `;
            shopGrid.appendChild(itemElement);
        });
    });
}

// Function to handle a student's purchase.
async function handlePurchase(itemId, itemName, itemPrice) {
    const user = auth.currentUser;
    if (!user) return;

    const price = parseFloat(itemPrice);
    const studentDocRef = doc(db, "classroom-rewards/main-class/students", user.uid);

    try {
        // Use a Firestore Transaction to ensure the operation is atomic.
        // This means either both the money deduction AND the history log succeed, or they both fail.
        // This prevents data corruption, e.g., a student losing money but not getting a record of the purchase.
        await runTransaction(db, async (transaction) => {
            const studentDoc = await transaction.get(studentDocRef);
            if (!studentDoc.exists()) {
                throw "Student document does not exist!";
            }

            const currentMoney = studentDoc.data().money;
            if (currentMoney < price) {
                throw "You do not have enough money for this item.";
            }

            const newMoney = currentMoney - price;

            // 1. Update the student's money.
            transaction.update(studentDocRef, { money: newMoney });

            // 2. Create a new document in the purchase history.
            const historyCollectionRef = collection(db, "classroom-rewards/main-class/purchase_history");
            const newHistoryRef = doc(historyCollectionRef); // Create a reference with a new auto-ID
            transaction.set(newHistoryRef, {
                studentId: user.uid,
                studentName: studentDoc.data().name, // Store name for easier display in admin panel
                itemId: itemId,
                itemName: itemName,
                cost: price,
                timestamp: serverTimestamp() // Use server's timestamp for accuracy
            });
        });

        alert(`Purchase successful! You bought: ${itemName}`);

    } catch (e) {
        console.error("Transaction failed: ", e);
        alert("Purchase failed: " + e);
    }
}

// Function to load a specific student's purchase history.
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
            row.innerHTML = `
                <td>${purchase.itemName}</td>
                <td>$${purchase.cost.toFixed(2)}</td>
                <td>${date}</td>
            `;
        });
    });
}


// --- EVENT LISTENERS for index.html ---
// We check if the elements exist before adding listeners to avoid errors
// when this script runs on admin.html.

if (document.getElementById('login-button')) {
    // Toggle between login and register forms
    document.getElementById('show-register').addEventListener('click', () => {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('register-container').style.display = 'block';
    });
    document.getElementById('show-login').addEventListener('click', () => {
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('register-container').style.display = 'none';
    });

    // Login button
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

    // Register button
    document.getElementById('register-button').addEventListener('click', async () => {
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const errorElem = document.getElementById('register-error');
        errorElem.textContent = '';

        if (!name) {
            errorElem.textContent = "Please enter your name.";
            return;
        }

        try {
            // Step 1: Create the user in Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // *** THIS IS THE FIX FOR THE ORIGINAL PERMISSION ERROR ***
            // Step 2: Immediately create the student's document in Firestore.
            // By creating the document BEFORE any read attempts (like onSnapshot),
            // we satisfy the security rule that requires the document to exist.
            const studentDocRef = doc(db, "classroom-rewards/main-class/students", user.uid);
            await setDoc(studentDocRef, {
                name: name,
                email: email,
                xp: 0,
                money: 0
            });

            // The onAuthStateChanged listener will now handle showing the dashboard.
        } catch (error) {
            console.error("Registration Error:", error);
            errorElem.textContent = error.message;
        }
    });

    // Logout button
    document.getElementById('logout-button').addEventListener('click', () => {
        signOut(auth);
    });

    // Event delegation for "Buy" buttons
    document.getElementById('dashboard-view').addEventListener('click', (e) => {
        if (e.target.classList.contains('buy-button')) {
            const button = e.target;
            handlePurchase(button.dataset.id, button.dataset.name, button.dataset.price);
        }
    });
}


// --- ADMIN PORTAL LOGIC (admin.html) ---

let allStudentsData = {}; // Cache student data to avoid multiple reads

// This function runs once the teacher logs in on the admin page.
function initializeAdminDashboard() {
    loadAllStudents();
    loadAdminShopManagement();
    loadFullPurchaseHistory();
}

// Function to load and display all student data.
function loadAllStudents() {
    const studentsCollectionRef = collection(db, "classroom-rewards/main-class/students");
    const studentsTableBody = document.querySelector("#students-table tbody");

    onSnapshot(studentsCollectionRef, (snapshot) => {
        studentsTableBody.innerHTML = "";
        allStudentsData = {}; // Clear cache
        snapshot.forEach(doc => {
            const student = doc.data();
            const studentId = doc.id;
            allStudentsData[studentId] = student; // Cache data

            const row = studentsTableBody.insertRow();
            row.innerHTML = `
                <td>${student.name}</td>
                <td>${student.email}</td>
                <td><input type="number" value="${student.xp}" class="student-xp-input" data-id="${studentId}"></td>
                <td><input type="number" value="${student.money}" step="0.01" class="student-money-input" data-id="${studentId}"></td>
                <td><button class="update-student-button" data-id="${studentId}">Update</button></td>
            `;
        });
    });
}

// Function to handle updating a student's data.
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
        alert("Student updated successfully!");
    } catch (error) {
        console.error("Error updating student:", error);
        alert("Failed to update student. See console for details.");
    }
}

// Function to load shop items for the admin management view.
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
                <td>$${item.price.toFixed(2)}</td>
                <td>
                    <button class="edit-item-button" data-id="${itemId}" data-name="${item.name}" data-price="${item.price}">Edit</button>
                    <button class="delete-item-button" data-id="${itemId}" style="background-color: #e74c3c;">Delete</button>
                </td>
            `;
        });
    });
}

// Function to save a new shop item or update an existing one.
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
            // Update existing item
            const itemDocRef = doc(db, "classroom-rewards/main-class/shop", editingId);
            await updateDoc(itemDocRef, itemData);
            alert("Item updated successfully!");
        } else {
            // Add new item
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

// Function to delete a shop item.
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

// Function to populate the form for editing.
function populateShopFormForEdit(id, name, price) {
    document.getElementById('edit-item-id').value = id;
    document.getElementById('item-name').value = name;
    document.getElementById('item-price').value = price;
    document.getElementById('cancel-edit-button').style.display = 'inline-block';
}

// Function to reset the shop management form.
function resetShopForm() {
    document.getElementById('edit-item-id').value = '';
    document.getElementById('item-name').value = '';
    document.getElementById('item-price').value = '';
    document.getElementById('cancel-edit-button').style.display = 'none';
}

// Function to load the full purchase history for the admin.
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
                <td>${studentName}</td>
                <td>${purchase.itemName}</td>
                <td>$${purchase.cost.toFixed(2)}</td>
                <td>${date}</td>
            `;
        });
    });
}


// --- EVENT LISTENERS for admin.html ---
if (document.getElementById('admin-panel-view')) {
    // Admin logout
    document.getElementById('admin-logout-button').addEventListener('click', () => {
        signOut(auth);
    });

    // Event delegation for student update buttons
    document.getElementById('students-table').addEventListener('click', e => {
        if (e.target.classList.contains('update-student-button')) {
            handleStudentUpdate(e.target.dataset.id);
        }
    });

    // Shop management form buttons
    document.getElementById('save-item-button').addEventListener('click', handleSaveShopItem);
    document.getElementById('cancel-edit-button').addEventListener('click', resetShopForm);

    // Event delegation for shop item edit/delete
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
