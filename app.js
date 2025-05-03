// Trigger new deployment with Vercel Pro
import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    addDoc,
    serverTimestamp,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let currentUser = null;
let currentChatUser = null;
const storage = getStorage();

// Profile Picture Upload
document.getElementById('profile-picture-preview').addEventListener('click', () => {
    document.getElementById('profile-picture-input').click();
});

document.getElementById('profile-picture-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            // Check file size (limit to 5MB - ImgBB's limit)
            if (file.size > 5 * 1024 * 1024) {
                alert('Image size should be less than 5MB');
                return;
            }

            // Create form data
            const formData = new FormData();
            formData.append('image', file);
            formData.append('key', 'b20dafa4db75ca192070ec47334a4a77');

            console.log('Uploading image to ImgBB...');
            
            // Upload to ImgBB
            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                body: formData
            });

            console.log('ImgBB response:', response);

            const data = await response.json();
            console.log('ImgBB data:', data);
            
            if (!data.success) {
                throw new Error(`ImgBB upload failed: ${data.error?.message || 'Unknown error'}`);
            }

            const imageUrl = data.data.url;
            console.log('Upload successful, image URL:', imageUrl);
            
            // Update the preview
            document.getElementById('profile-picture-preview').src = imageUrl;
            
            // Update Firebase Auth profile
            await updateProfile(currentUser, {
                photoURL: imageUrl
            });
            
            // Update Firestore
            await setDoc(doc(db, 'users', currentUser.uid), {
                profilePicture: imageUrl
            }, { merge: true });
            
            // Update UI
            document.getElementById('current-user-avatar').src = imageUrl;
            
            alert('Profile picture updated successfully!');
        } catch (error) {
            console.error('Detailed error uploading profile picture:', error);
            alert(`Error uploading profile picture: ${error.message}`);
        }
    }
});

// Auth Functions
function showSignup() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if (loginForm && signupForm) {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
        clearErrorMessages();
    }
}

function showLogin() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    if (loginForm && signupForm) {
        signupForm.style.display = 'none';
        loginForm.style.display = 'block';
        clearErrorMessages();
    }
}

function clearErrorMessages() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.classList.remove('show');
    });
}

function showError(element, message) {
    let errorElement = element.nextElementSibling;
    if (!errorElement || !errorElement.classList.contains('error-message')) {
        errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        element.parentNode.insertBefore(errorElement, element.nextSibling);
    }
    errorElement.textContent = message;
    errorElement.classList.add('show');
}

// Add event listeners for auth links and buttons
document.addEventListener('DOMContentLoaded', () => {
    // Auth link event listeners
    const signupLink = document.querySelector('#login-form .auth-link');
    const loginLink = document.querySelector('#signup-form .auth-link');
    const loginButton = document.getElementById('login-button');
    const signupButton = document.getElementById('signup-button');

    if (signupLink) {
        signupLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSignup();
        });
    }

    if (loginLink) {
        loginLink.addEventListener('click', (e) => {
            e.preventDefault();
            showLogin();
        });
    }

    if (loginButton) {
        loginButton.addEventListener('click', login);
    }

    if (signupButton) {
        signupButton.addEventListener('click', signup);
    }
});

async function signup() {
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const profilePicture = document.getElementById('profile-picture-preview').src;
    const signupButton = document.getElementById('signup-button');

    // Clear previous errors
    clearErrorMessages();

    // Validate inputs
    if (!username) {
        showError(document.getElementById('signup-username'), 'Username is required');
        return;
    }
    if (!email) {
        showError(document.getElementById('signup-email'), 'Email is required');
        return;
    }
    if (!password) {
        showError(document.getElementById('signup-password'), 'Password is required');
        return;
    }
    if (password.length < 6) {
        showError(document.getElementById('signup-password'), 'Password must be at least 6 characters');
        return;
    }

    try {
        signupButton.classList.add('loading');
        
        // Create user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create user document in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            username: username,
            email: email,
            profilePicture: profilePicture,
            createdAt: serverTimestamp()
        });

        // Update the profile
        await updateProfile(userCredential.user, {
            displayName: username,
            photoURL: profilePicture
        });

        // Show chat section
        showChatSection();
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'An error occurred during signup';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'Email is already in use';
                showError(document.getElementById('signup-email'), errorMessage);
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                showError(document.getElementById('signup-email'), errorMessage);
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak';
                showError(document.getElementById('signup-password'), errorMessage);
                break;
            default:
                alert(errorMessage);
        }
    } finally {
        signupButton.classList.remove('loading');
    }
}

async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const loginButton = document.getElementById('login-button');

    // Clear previous errors
    clearErrorMessages();

    // Validate inputs
    if (!email) {
        showError(document.getElementById('login-email'), 'Email is required');
        return;
    }
    if (!password) {
        showError(document.getElementById('login-password'), 'Password is required');
        return;
    }

    try {
        loginButton.classList.add('loading');
        await signInWithEmailAndPassword(auth, email, password);
        showChatSection();
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'An error occurred during login';
        
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage = 'Invalid email or password';
                showError(document.getElementById('login-email'), errorMessage);
                showError(document.getElementById('login-password'), errorMessage);
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address';
                showError(document.getElementById('login-email'), errorMessage);
                break;
            default:
                alert(errorMessage);
        }
    } finally {
        loginButton.classList.remove('loading');
    }
}

async function logout() {
    try {
        await signOut(auth);
        showAuthSection();
    } catch (error) {
        console.error('Logout error:', error);
        alert(error.message);
    }
}

// UI Functions
function showAuthSection() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('chat-section').style.display = 'none';
}

function showChatSection() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('chat-section').style.display = 'block';
    loadUsers();
}

// Chat Functions
async function loadUsers() {
    const usersContainer = document.getElementById('users-container');
    usersContainer.innerHTML = '';

    try {
        // Get current user's pinned conversations
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const pinnedConversations = currentUserDoc.data()?.pinnedConversations || [];

        // Get all messages where current user is a participant
        const messagesQuery = query(
            collection(db, 'messages'),
            where('participants', 'array-contains', currentUser.uid)
        );
        const messagesSnapshot = await getDocs(messagesQuery);

        // Get unique user IDs from messages
        const dmUserIds = new Set();
        messagesSnapshot.forEach(doc => {
            const message = doc.data();
            message.participants.forEach(id => {
                if (id !== currentUser.uid) {
                    dmUserIds.add(id);
                }
            });
        });

        // Get user details for each DM'd user
        const usersPromises = Array.from(dmUserIds).map(async (userId) => {
            const userDoc = await getDoc(doc(db, 'users', userId));
            return {
                id: userId,
                ...userDoc.data()
            };
        });

        const users = await Promise.all(usersPromises);

        // Sort users: pinned first, then alphabetically
        users.sort((a, b) => {
            const aPinned = pinnedConversations.includes(a.id);
            const bPinned = pinnedConversations.includes(b.id);
            
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            
            return a.username.localeCompare(b.username);
        });

        // Display users
        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            if (pinnedConversations.includes(user.id)) {
                userElement.classList.add('pinned');
            }
            userElement.dataset.uid = user.id;
            userElement.innerHTML = `
                <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${user.username}" class="user-avatar">
                <span class="username">${user.username}${user.verified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : ''}</span>
                <div class="user-actions">
                    <span class="material-symbols-outlined action-icon pin-icon">keep</span>
                    <span class="material-symbols-outlined action-icon close-icon">close</span>
                </div>
            `;
            
            // Add click handler for the user item
            userElement.onclick = (e) => {
                // Only start chat if not clicking on action icons
                if (!e.target.classList.contains('action-icon')) {
                    startChat(user.id, user.username);
                }
            };

            // Add click handler for close icon
            const closeIcon = userElement.querySelector('.close-icon');
            closeIcon.onclick = async (e) => {
                e.stopPropagation();
                // Remove the user element
                userElement.remove();
                // Update Firestore to mark conversation as hidden
                try {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        hiddenConversations: arrayUnion(user.id)
                    }, { merge: true });
                } catch (error) {
                    console.error('Error hiding conversation:', error);
                }
            };

            // Add click handler for pin icon
            const pinIcon = userElement.querySelector('.pin-icon');
            pinIcon.onclick = async (e) => {
                e.stopPropagation();
                const isPinned = userElement.classList.contains('pinned');
                userElement.classList.toggle('pinned');
                
                // Move the element to the top immediately
                if (!isPinned) {
                    usersContainer.insertBefore(userElement, usersContainer.firstChild);
                }
                
                // Update Firestore
                try {
                    if (!isPinned) {
                        await setDoc(doc(db, 'users', currentUser.uid), {
                            pinnedConversations: arrayUnion(user.id)
                        }, { merge: true });
                    } else {
                        await setDoc(doc(db, 'users', currentUser.uid), {
                            pinnedConversations: arrayRemove(user.id)
                        }, { merge: true });
                    }
                } catch (error) {
                    console.error('Error pinning conversation:', error);
                }
            };

            usersContainer.appendChild(userElement);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function startChat(userId, username) {
    currentChatUser = { id: userId, username: username };
    
    // Check if user is already in sidebar
    const existingUser = document.querySelector(`.user-item[data-uid="${userId}"]`);
    if (!existingUser) {
        // Get user's profile picture
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();
        const profilePicture = userData?.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png';

        // Create new user element
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.dataset.uid = userId;
        userElement.innerHTML = `
            <img src="${profilePicture}" alt="${username}" class="user-avatar">
            <span class="username">${username}${userData?.verified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : ''}</span>
            <div class="user-actions">
                <span class="material-symbols-outlined action-icon pin-icon">keep</span>
                <span class="material-symbols-outlined action-icon close-icon">close</span>
            </div>
        `;

        // Add click handler for the user item
        userElement.onclick = (e) => {
            if (!e.target.classList.contains('action-icon')) {
                startChat(userId, username);
            }
        };

        // Add click handler for close icon
        const closeIcon = userElement.querySelector('.close-icon');
        closeIcon.onclick = async (e) => {
            e.stopPropagation();
            userElement.remove();
            try {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    hiddenConversations: arrayUnion(userId)
                }, { merge: true });
            } catch (error) {
                console.error('Error hiding conversation:', error);
            }
        };

        // Add click handler for pin icon
        const pinIcon = userElement.querySelector('.pin-icon');
        pinIcon.onclick = async (e) => {
            e.stopPropagation();
            const isPinned = userElement.classList.contains('pinned');
            userElement.classList.toggle('pinned');
            
            if (!isPinned) {
                const usersContainer = document.getElementById('users-container');
                usersContainer.insertBefore(userElement, usersContainer.firstChild);
            }
            
            try {
                if (!isPinned) {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        pinnedConversations: arrayUnion(userId)
                    }, { merge: true });
                } else {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        pinnedConversations: arrayRemove(userId)
                    }, { merge: true });
                }
            } catch (error) {
                console.error('Error pinning conversation:', error);
            }
        };

        // Add to sidebar
        const usersContainer = document.getElementById('users-container');
        usersContainer.appendChild(userElement);
    }
    
    // Update active user in sidebar
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        if (item.dataset.uid === userId) {
            item.classList.add('active');
            // Animate other items
            userItems.forEach(otherItem => {
                if (otherItem !== item) {
                    const itemRect = item.getBoundingClientRect();
                    const otherRect = otherItem.getBoundingClientRect();
                    if (otherRect.top < itemRect.top) {
                        otherItem.classList.add('shift-up');
                    } else {
                        otherItem.classList.add('shift-down');
                    }
                }
            });
        } else {
            item.classList.remove('active');
            item.classList.remove('shift-up', 'shift-down');
        }
    });

    // Update chat header
    document.getElementById('active-chat-username').textContent = username;

    // Show message input
    const messageInput = document.querySelector('.message-input');
    messageInput.classList.add('visible');

    // Update message input placeholder
    const messageInputField = document.getElementById('message-input');
    if (messageInputField) {
        messageInputField.placeholder = `Message ${username}`;
        messageInputField.focus();
    }

    // Load messages
    loadMessages();
}

async function loadMessages() {
    if (!currentUser || !currentChatUser) {
        console.log('No current user or chat user');
        return;
    }

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    try {
        const messagesQuery = query(
            collection(db, 'messages'),
            where('participants', 'array-contains', currentUser.uid),
            orderBy('timestamp', 'asc')
        );

        if (window.currentMessageUnsubscribe) {
            window.currentMessageUnsubscribe();
        }

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            chatMessages.innerHTML = '';
            
            snapshot.forEach(doc => {
                const message = doc.data();
                
                if (message.participants.includes(currentChatUser.id) && 
                    message.participants.includes(currentUser.uid)) {
                    
                    const messageElement = document.createElement('div');
                    messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                    messageElement.innerHTML = `
                        <div class="content">${message.content}</div>
                    `;
                    chatMessages.appendChild(messageElement);
                }
            });
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, (error) => {
            console.error('Error in message snapshot:', error);
        });

        window.currentMessageUnsubscribe = unsubscribe;
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Check Firebase connection
function checkFirebaseConnection() {
    if (!auth || !db) {
        console.error('Firebase is not initialized');
        return false;
    }
    return true;
}

// Compose Modal
function openComposeModal() {
    const modal = document.getElementById('compose-modal');
    modal.style.display = 'block';
}

function closeComposeModal() {
    const modal = document.getElementById('compose-modal');
    modal.style.display = 'none';
}

// Compose new message
document.addEventListener('DOMContentLoaded', () => {
    // Message input event listener
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Compose icon event listener
    const composeIcon = document.querySelector('.compose-icon');
    if (composeIcon) {
        composeIcon.addEventListener('click', openComposeModal);
    }

    // Close modal event listener
    const closeModal = document.querySelector('.close-modal');
    if (closeModal) {
        closeModal.addEventListener('click', closeComposeModal);
    }

    // Compose search event listener
    const composeSearch = document.getElementById('compose-search');
    if (composeSearch) {
        composeSearch.addEventListener('input', async (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const composeResults = document.getElementById('compose-results');
            composeResults.innerHTML = '';

            if (searchTerm.length > 0) {
                try {
                    // Get all users except current user
                    const usersSnapshot = await getDocs(collection(db, 'users'));
                    const suggestions = [];
                    
                    usersSnapshot.forEach(doc => {
                        if (doc.id !== currentUser.uid) {
                            const user = doc.data();
                            const username = user.username.toLowerCase();
                            
                            if (username.includes(searchTerm)) {
                                suggestions.push({
                                    id: doc.id,
                                    username: user.username,
                                    profilePicture: user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'
                                });
                            }
                        }
                    });

                    // Sort suggestions by username
                    suggestions.sort((a, b) => a.username.localeCompare(b.username));

                    // Display suggestions
                    suggestions.forEach(user => {
                        const userElement = document.createElement('div');
                        userElement.className = 'compose-user-item';
                        userElement.innerHTML = `
                            <img src="${user.profilePicture}" alt="${user.username}" class="user-avatar">
                            <span>${user.username}</span>
                        `;
                        userElement.onclick = () => {
                            startChat(user.id, user.username);
                            closeComposeModal();
                        };
                        composeResults.appendChild(userElement);
                    });

                    if (suggestions.length === 0) {
                        const noResults = document.createElement('div');
                        noResults.className = 'no-results';
                        noResults.textContent = 'No users found';
                        composeResults.appendChild(noResults);
                    }
                } catch (error) {
                    console.error('Error searching users:', error);
                    const errorElement = document.createElement('div');
                    errorElement.className = 'no-results';
                    errorElement.textContent = 'Error searching users. Please try again.';
                    composeResults.appendChild(errorElement);
                }
            }
        });
    }

    // Search input event listener
    const searchInput = document.getElementById('search-user');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            if (searchTerm) {
                searchUsers(searchTerm);
            } else {
                loadUsers(); // Load all users if search is empty
            }
        });
    }
});

// Close compose modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('compose-modal');
    if (event.target === modal) {
        closeComposeModal();
    }
});

// Send message
async function sendMessage() {
    if (!currentUser || !currentChatUser) {
        console.log('No current user or chat user');
        return;
    }

    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!content) {
        return;
    }

    try {
        console.log('Attempting to send message with data:', {
            content,
            senderId: currentUser.uid,
            receiverId: currentChatUser.id,
            participants: [currentUser.uid, currentChatUser.id]
        });

        // Create message data
        const messageData = {
            content: content,
            senderId: currentUser.uid,
            receiverId: currentChatUser.id,
            participants: [currentUser.uid, currentChatUser.id],
            timestamp: serverTimestamp()
        };

        // Add message to Firestore
        const docRef = await addDoc(collection(db, 'messages'), messageData);
        console.log('Message sent successfully with ID:', docRef.id);
        
        // Clear input
        messageInput.value = '';
        
        // Scroll to bottom
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message: ' + error.message);
    }
}

// Update current user profile in sidebar
function updateCurrentUserProfile(user) {
    if (user) {
        document.getElementById('current-username').textContent = user.displayName || 'Username';
        document.getElementById('current-user-avatar').src = user.photoURL || 'https://i.ibb.co/Gf9VD2MN/pfp.png';
        
        // Update user items in the list
        const userItems = document.querySelectorAll('.user-item');
        userItems.forEach(item => {
            if (item.dataset.uid === user.uid) {
                item.querySelector('span').textContent = user.displayName || 'Username';
                item.querySelector('img').src = user.photoURL || 'https://i.ibb.co/Gf9VD2MN/pfp.png';
            }
        });
    }
}

// Auth State Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        updateCurrentUserProfile(user);
        showChatSection();
    } else {
        currentUser = null;
        showAuthSection();
    }
});

// Settings Modal Functions
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const currentUsername = document.getElementById('current-username').textContent;
    const currentProfilePicture = document.getElementById('current-user-avatar').src;
    
    document.getElementById('settings-username').value = currentUsername;
    document.getElementById('settings-profile-picture').src = currentProfilePicture;
    
    modal.style.display = 'block';
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}

// Settings Modal Event Listeners
document.querySelector('.settings-icon').addEventListener('click', openSettingsModal);
document.querySelector('#settings-modal .close-modal').addEventListener('click', closeSettingsModal);

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('settings-modal');
    if (event.target === modal) {
        closeSettingsModal();
    }
});

// Settings Profile Picture Upload
document.getElementById('settings-profile-picture').addEventListener('click', () => {
    document.getElementById('settings-profile-picture-input').click();
});

document.getElementById('settings-profile-picture-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            // Check file size (limit to 5MB - ImgBB's limit)
            if (file.size > 5 * 1024 * 1024) {
                alert('Image size should be less than 5MB');
                return;
            }

            // Create form data
            const formData = new FormData();
            formData.append('image', file);
            formData.append('key', 'b20dafa4db75ca192070ec47334a4a77');

            console.log('Uploading image to ImgBB...');
            
            // Upload to ImgBB
            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                body: formData
            });

            console.log('ImgBB response:', response);

            const data = await response.json();
            console.log('ImgBB data:', data);
            
            if (!data.success) {
                throw new Error(`ImgBB upload failed: ${data.error?.message || 'Unknown error'}`);
            }

            const imageUrl = data.data.url;
            console.log('Upload successful, image URL:', imageUrl);
            
            // Update the preview
            document.getElementById('settings-profile-picture').src = imageUrl;
            
            // Update Firebase Auth profile
            await updateProfile(currentUser, {
                photoURL: imageUrl
            });
            
            // Update Firestore
            await setDoc(doc(db, 'users', currentUser.uid), {
                profilePicture: imageUrl
            }, { merge: true });
            
            // Update UI
            document.getElementById('current-user-avatar').src = imageUrl;
            
            alert('Profile picture updated successfully!');
        } catch (error) {
            console.error('Detailed error uploading profile picture:', error);
            alert(`Error uploading profile picture: ${error.message}`);
        }
    }
});

// Save Settings
document.querySelector('.save-button').addEventListener('click', async () => {
    const newUsername = document.getElementById('settings-username').value.trim();
    const newProfilePicture = document.getElementById('settings-profile-picture').src;

    if (!newUsername) {
        alert('Please enter a username');
        return;
    }

    try {
        // Update Firebase Auth profile
        await updateProfile(currentUser, {
            displayName: newUsername,
            photoURL: newProfilePicture
        });

        // Update Firestore
        await setDoc(doc(db, 'users', currentUser.uid), {
            username: newUsername,
            profilePicture: newProfilePicture
        }, { merge: true });

        // Update UI
        document.getElementById('current-username').textContent = newUsername;
        document.getElementById('current-user-avatar').src = newProfilePicture;

        // Update all user items in the list
        const userItems = document.querySelectorAll('.user-item');
        userItems.forEach(item => {
            if (item.dataset.uid === currentUser.uid) {
                item.querySelector('span').textContent = newUsername;
                item.querySelector('img').src = newProfilePicture;
            }
        });

        closeSettingsModal();
        alert('Profile updated successfully!');
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Error updating profile. Please try again.');
    }
});

// Search Functions
async function searchUsers(searchTerm) {
    const usersContainer = document.getElementById('users-container');
    usersContainer.innerHTML = '';

    try {
        // Get current user's hidden conversations
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const hiddenConversations = currentUserDoc.data()?.hiddenConversations || [];
        const pinnedConversations = currentUserDoc.data()?.pinnedConversations || [];

        // Get all messages where current user is a participant
        const messagesQuery = query(
            collection(db, 'messages'),
            where('participants', 'array-contains', currentUser.uid)
        );
        const messagesSnapshot = await getDocs(messagesQuery);

        // Get unique user IDs from messages
        const dmUserIds = new Set();
        messagesSnapshot.forEach(doc => {
            const message = doc.data();
            message.participants.forEach(id => {
                if (id !== currentUser.uid) {
                    dmUserIds.add(id);
                }
            });
        });

        // Get user details for each DM'd user
        const usersPromises = Array.from(dmUserIds).map(async (userId) => {
            const userDoc = await getDoc(doc(db, 'users', userId));
            return {
                id: userId,
                ...userDoc.data()
            };
        });

        const users = await Promise.all(usersPromises);

        // Filter users based on search term and exclude hidden conversations
        const filteredUsers = users.filter(user => 
            !hiddenConversations.includes(user.id) &&
            user.username.toLowerCase().includes(searchTerm.toLowerCase())
        );

        // Sort users: pinned first, then alphabetically
        filteredUsers.sort((a, b) => {
            const aPinned = pinnedConversations.includes(a.id);
            const bPinned = pinnedConversations.includes(b.id);
            
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            
            return a.username.localeCompare(b.username);
        });

        // Display filtered users
        filteredUsers.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            if (pinnedConversations.includes(user.id)) {
                userElement.classList.add('pinned');
            }
            userElement.dataset.uid = user.id;
            userElement.innerHTML = `
                <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${user.username}" class="user-avatar">
                <span class="username">${user.username}${user.verified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : ''}</span>
                <div class="user-actions">
                    <span class="material-symbols-outlined action-icon pin-icon">keep</span>
                    <span class="material-symbols-outlined action-icon close-icon">close</span>
                </div>
            `;
            
            // Add click handler for the user item
            userElement.onclick = (e) => {
                // Only start chat if not clicking on action icons
                if (!e.target.classList.contains('action-icon')) {
                    startChat(user.id, user.username);
                }
            };

            // Add click handler for close icon
            const closeIcon = userElement.querySelector('.close-icon');
            closeIcon.onclick = async (e) => {
                e.stopPropagation();
                // Remove the user element
                userElement.remove();
                // Update Firestore to mark conversation as hidden
                try {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        hiddenConversations: arrayUnion(user.id)
                    }, { merge: true });
                } catch (error) {
                    console.error('Error hiding conversation:', error);
                }
            };

            // Add click handler for pin icon
            const pinIcon = userElement.querySelector('.pin-icon');
            pinIcon.onclick = async (e) => {
                e.stopPropagation();
                const isPinned = userElement.classList.contains('pinned');
                userElement.classList.toggle('pinned');
                
                // Move the element to the top immediately
                if (!isPinned) {
                    usersContainer.insertBefore(userElement, usersContainer.firstChild);
                }
                
                // Update Firestore
                try {
                    if (!isPinned) {
                        await setDoc(doc(db, 'users', currentUser.uid), {
                            pinnedConversations: arrayUnion(user.id)
                        }, { merge: true });
                    } else {
                        await setDoc(doc(db, 'users', currentUser.uid), {
                            pinnedConversations: arrayRemove(user.id)
                        }, { merge: true });
                    }
                } catch (error) {
                    console.error('Error pinning conversation:', error);
                }
            };

            usersContainer.appendChild(userElement);
        });
    } catch (error) {
        console.error('Error searching users:', error);
    }
}

// Compose Modal Functions
async function searchAllUsers(searchTerm) {
    const composeResults = document.getElementById('compose-results');
    composeResults.innerHTML = '';

    try {
        // Get all messages where current user is a participant
        const messagesQuery = query(
            collection(db, 'messages'),
            where('participants', 'array-contains', currentUser.uid)
        );
        const messagesSnapshot = await getDocs(messagesQuery);

        // Get unique user IDs from messages
        const dmUserIds = new Set();
        messagesSnapshot.forEach(doc => {
            const message = doc.data();
            message.participants.forEach(id => {
                if (id !== currentUser.uid) {
                    dmUserIds.add(id);
                }
            });
        });

        // Get all users except current user
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        
        usersSnapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                const user = {
                    id: doc.id,
                    ...doc.data()
                };
                if (user.username.toLowerCase().includes(searchTerm.toLowerCase())) {
                    users.push(user);
                }
            }
        });

        // Display users
        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'compose-user-item';
            userElement.innerHTML = `
                <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${user.username}" class="user-avatar">
                <span>${user.username}</span>
            `;
            userElement.onclick = () => {
                startChat(user.id, user.username);
                closeComposeModal();
            };
            composeResults.appendChild(userElement);
        });

        if (users.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'No users found';
            composeResults.appendChild(noResults);
        }
    } catch (error) {
        console.error('Error searching all users:', error);
    }
}

// Add event listeners for search
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-user');
    const clearSearch = document.querySelector('.clear-search');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            if (searchTerm) {
                searchUsers(searchTerm);
            } else {
                loadUsers();
            }
        });
    }

    if (clearSearch) {
        clearSearch.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                loadUsers();
            }
        });
    }
});

// Sign Out Button
document.querySelector('.signout-button').addEventListener('click', async () => {
    try {
        await signOut(auth);
        showAuthSection();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
    }
}); 
