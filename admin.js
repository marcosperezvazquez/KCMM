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
// ...
