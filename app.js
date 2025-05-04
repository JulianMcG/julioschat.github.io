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
    arrayRemove,
    updateDoc
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
        // Get current user's hidden conversations
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const currentUserData = currentUserDoc.data();
        const hiddenConversations = currentUserData?.hiddenConversations || [];
        const pinnedConversations = currentUserData?.pinnedConversations || [];

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
            const userData = userDoc.data();
            return {
                id: userId,
                username: userData.username,
                profilePicture: userData.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png',
                verified: userData.verified,
                isPinned: pinnedConversations.includes(userId)
            };
        });

        const users = await Promise.all(usersPromises);

        // Sort users: pinned first, then alphabetically
        users.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return a.username.localeCompare(b.username);
        });

        // Display users
        users.forEach(user => {
            const userElement = createUserElement(user);
            userElement.dataset.uid = user.id;
            
            if (user.isPinned) {
                userElement.classList.add('pinned');
                usersContainer.insertBefore(userElement, usersContainer.firstChild);
            } else {
                usersContainer.appendChild(userElement);
            }
            
            // Add click handler for the user item
            userElement.onclick = (e) => {
                if (!e.target.classList.contains('action-icon')) {
                    startChat(user.id, user.username);
                }
            };

            // Add click handler for close icon
            const closeIcon = userElement.querySelector('.close-icon');
            closeIcon.onclick = async (e) => {
                e.stopPropagation();
                userElement.remove();
                try {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        hiddenConversations: arrayUnion(user.id)
                    }, { merge: true });
                } catch (error) {
                    console.error('Error hiding conversation:', error);
                }
            };
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.innerHTML = `
        <img src="${user.profilePicture || 'default-avatar.png'}" alt="${user.username}" class="profile-picture">
        <span class="username">${user.username}${user.verified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : ''}</span>
        <div class="user-actions">
            <span class="material-symbols-outlined action-icon pin-icon">keep</span>
            <span class="material-symbols-outlined action-icon close-icon">close</span>
        </div>
    `;
    
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
    
    return userElement;
}

async function startChat(userId, username) {
    currentChatUser = { id: userId, username: username };
    
    // Check if user is already in sidebar
    const existingUser = document.querySelector(`.user-item[data-uid="${userId}"]`);
    if (!existingUser) {
        // Get user's profile picture and verification status
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();
        const profilePicture = userData?.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png';
        const isVerified = userData?.verified || false;

        // Create new user element
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.dataset.uid = userId;
        userElement.innerHTML = `
            <img src="${profilePicture}" alt="${username}" class="profile-picture">
            <span class="username">${username}${isVerified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : ''}</span>
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
        } else {
            item.classList.remove('active');
        }
    });

    // Get user's verification status
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.data();
    const isVerified = userData?.verified || false;

    // Update chat header with verified badge if user is verified
    const verifiedBadge = isVerified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : '';
    document.getElementById('active-chat-username').innerHTML = `${username}${verifiedBadge}`;

    // Show message input and user options icon
    const messageInput = document.querySelector('.message-input');
    messageInput.classList.add('visible');
    document.querySelector('.chat-header svg').style.display = 'block';

    // Check if user is blocked
    const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const currentUserData = currentUserDoc.data();
    const blockedUsers = currentUserData?.blockedUsers || [];

    // Update message input state immediately
    const messageInputField = document.getElementById('message-input');
    if (blockedUsers.includes(userId)) {
        // User is blocked, show blocked state
        messageInput.classList.add('blocked');
        messageInputField.placeholder = 'You cannot send messages to a user you have blocked.';
        messageInputField.disabled = true;

        // Add unblock button if it doesn't exist
        if (!messageInput.querySelector('.unblock-button')) {
            const unblockButton = document.createElement('button');
            unblockButton.className = 'unblock-button';
            unblockButton.textContent = 'Unblock';
            unblockButton.onclick = async () => {
                try {
                    // Update UI immediately
                    messageInput.classList.remove('blocked');
                    messageInputField.placeholder = `Message ${username}`;
                    messageInputField.disabled = false;
                    unblockButton.remove();
                    
                    // Update Firestore
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        blockedUsers: arrayRemove(userId)
                    }, { merge: true });
                } catch (error) {
                    console.error('Error unblocking user:', error);
                    // Revert UI changes if Firestore update fails
                    messageInput.classList.add('blocked');
                    messageInputField.placeholder = 'You cannot send messages to a user you have blocked.';
                    messageInputField.disabled = true;
                    messageInput.appendChild(unblockButton);
                }
            };
            messageInput.appendChild(unblockButton);
        }
    } else {
        // User is not blocked, show normal state
        messageInput.classList.remove('blocked');
        messageInputField.placeholder = `Message ${username}`;
        messageInputField.disabled = false;
        
        // Remove unblock button if it exists
        const unblockButton = messageInput.querySelector('.unblock-button');
        if (unblockButton) {
            unblockButton.remove();
        }
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
        // Get current user's blocked users list
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const currentUserData = currentUserDoc.data();
        const blockedUsers = currentUserData?.blockedUsers || [];

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
                
                // Only show messages if:
                // 1. The message is between current user and current chat user
                // 2. The sender is not blocked
                if (message.participants.includes(currentChatUser.id) && 
                    message.participants.includes(currentUser.uid) &&
                    !blockedUsers.includes(message.senderId)) {
                    
                    const messageElement = document.createElement('div');
                    messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                    messageElement.dataset.messageId = doc.id;
                    
                    // Add reaction icon
                    const reactionIcon = document.createElement('span');
                    reactionIcon.className = 'material-symbols-outlined reaction-icon';
                    reactionIcon.textContent = 'sentiment_satisfied';
                    reactionIcon.onclick = (e) => {
                        e.stopPropagation();
                        showEmojiList(messageElement, doc.id);
                    };
                    
                    // Add emoji list
                    const emojiList = document.createElement('div');
                    emojiList.className = 'emoji-list';
                    const emojis = ['❤️', '👍', '👎', '😂', '‼️', '❓', '🔥'];
                    emojis.forEach(emoji => {
                        const emojiOption = document.createElement('span');
                        emojiOption.className = 'emoji-option';
                        emojiOption.textContent = emoji;
                        emojiOption.onclick = (e) => {
                            e.stopPropagation();
                            addReaction(doc.id, emoji);
                            emojiList.classList.remove('show');
                        };
                        emojiList.appendChild(emojiOption);
                    });
                    
                    // Add reaction indicator if exists
                    let reactionIndicator = '';
                    if (message.reaction && message.reactorId) {
                        // Determine if current user is the reactor
                        const isReactor = message.reactorId === currentUser.uid;
                        const reactionClass = isReactor ? 'reactor' : 'reactee';
                        reactionIndicator = `<div class="reaction-indicator ${reactionClass}">${message.reaction}</div>`;
                    }
                    
                    messageElement.innerHTML = `
                        ${reactionIndicator}
                        <div class="content">${message.content}</div>
                    `;
                    
                    messageElement.appendChild(reactionIcon);
                    messageElement.appendChild(emojiList);
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

function showEmojiList(messageElement, messageId) {
    const emojiList = messageElement.querySelector('.emoji-list');
    emojiList.classList.toggle('show');
    
    // Close other emoji lists
    document.querySelectorAll('.emoji-list.show').forEach(list => {
        if (list !== emojiList) {
            list.classList.remove('show');
        }
    });
}

async function addReaction(messageId, emoji) {
    try {
        const messageRef = doc(db, 'messages', messageId);
        
        // First get the current state
        const messageDoc = await getDoc(messageRef);
        const currentData = messageDoc.data();
        
        // If the current user already reacted with this emoji, remove the reaction
        if (currentData?.reaction === emoji && currentData?.reactorId === currentUser.uid) {
            await setDoc(messageRef, {
                ...currentData,
                reaction: null,
                reactorId: null,
                reactionTimestamp: null
            }, { merge: true });
        } else {
            // Otherwise, set the new reaction
            await setDoc(messageRef, {
                ...currentData,
                reaction: emoji,
                reactorId: currentUser.uid,
                reactionTimestamp: serverTimestamp()
            }, { merge: true });
        }
    } catch (error) {
        console.error('Error adding reaction:', error);
    }
}

// Close emoji lists when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-list') && !e.target.closest('.reaction-icon')) {
        document.querySelectorAll('.emoji-list.show').forEach(list => {
            list.classList.remove('show');
        });
    }
});

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
        // Get current user's data to check blocked users
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const currentUserData = currentUserDoc.data();
        const blockedUsers = currentUserData?.blockedUsers || [];

        // Check if the current user has blocked the receiver
        if (blockedUsers.includes(currentChatUser.id)) {
            return; // Don't show alert as the UI already indicates the blocked state
        }

        // Get receiver's data to check if they've blocked the sender
        const receiverDoc = await getDoc(doc(db, 'users', currentChatUser.id));
        const receiverData = receiverDoc.data();
        const receiverBlockedUsers = receiverData?.blockedUsers || [];

        // Check if the receiver has blocked the current user
        if (receiverBlockedUsers.includes(currentUser.uid)) {
            alert('You cannot send messages to this user as they have blocked you.');
            return;
        }

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
        // Get user's verification status from Firestore
        getDoc(doc(db, 'users', user.uid)).then(userDoc => {
            const userData = userDoc.data();
            const isVerified = userData?.verified || false;
            
            // Update username with verified badge if user is verified
            const verifiedBadge = isVerified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : '';
            document.getElementById('current-username').innerHTML = `${user.displayName || 'Username'}${verifiedBadge}`;
            document.getElementById('current-user-avatar').src = user.photoURL || 'https://i.ibb.co/Gf9VD2MN/pfp.png';

            // Update user items in the list
            const userItems = document.querySelectorAll('.user-item');
            userItems.forEach(item => {
                if (item.dataset.uid === user.uid) {
                    item.querySelector('.username').innerHTML = `${user.displayName || 'Username'}${verifiedBadge}`;
                    item.querySelector('img').src = user.photoURL || 'https://i.ibb.co/Gf9VD2MN/pfp.png';
                }
            });
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
    const userItems = usersContainer.querySelectorAll('.user-item');
    
    userItems.forEach(userItem => {
        const username = userItem.querySelector('.username').textContent.toLowerCase();
        if (username.includes(searchTerm.toLowerCase())) {
            userItem.style.display = 'flex';
        } else {
            userItem.style.display = 'none';
        }
    });
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
                loadUsers(); // Reload all users when search is empty
            }
        });
    }

    if (clearSearch) {
        clearSearch.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                loadUsers(); // Reload all users when search is cleared
            }
        });
    }
});

// Sign Out Button
document.querySelector('.signout-button').addEventListener('click', async () => {
    closeSettingsModal();
    try {
        await signOut(auth);
        showAuthSection();
    } catch (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
    }
});

function updateChatHeader(user) {
    const chatHeader = document.querySelector('.chat-header');
    if (!chatHeader) return;
    
    chatHeader.innerHTML = `
        <img src="${user.photoURL || 'default-avatar.png'}" alt="${user.username}" class="profile-picture">
        <span class="username">${user.username}${user.verified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : ''}</span>
    `;
}

// User Options Modal
let currentSelectedUser = null;

// Open user options modal
function openUserOptionsModal(userId, username) {
    currentSelectedUser = { id: userId, username };
    const modal = document.getElementById('user-options-modal');
    const aliasInput = document.getElementById('user-alias');
    const blockButton = document.getElementById('block-user');
    const unblockButton = document.getElementById('unblock-user');
    
    // Check if user is blocked
    getDoc(doc(db, 'users', currentUser.uid)).then(userDoc => {
        const userData = userDoc.data();
        const blockedUsers = userData?.blockedUsers || [];
        const userAliases = userData?.userAliases || {};
        
        // Set alias input value if exists
        aliasInput.value = userAliases[userId] || '';
        
        // Show appropriate block/unblock button
        if (blockedUsers.includes(userId)) {
            blockButton.style.display = 'none';
            unblockButton.style.display = 'block';
        } else {
            blockButton.style.display = 'block';
            unblockButton.style.display = 'none';
        }
    });
    
    modal.style.display = 'block';
}

// Close user options modal
function closeUserOptionsModal() {
    const modal = document.getElementById('user-options-modal');
    modal.style.display = 'none';
    currentSelectedUser = null;
}

// Save user alias
async function saveUserAlias() {
    if (!currentSelectedUser) return;
    
    const aliasInput = document.getElementById('user-alias');
    const alias = aliasInput.value.trim();
    
    try {
        await setDoc(doc(db, 'users', currentUser.uid), {
            userAliases: {
                [currentSelectedUser.id]: alias
            }
        }, { merge: true });
        
        // Update username display if this is the current chat
        if (currentChatUser && currentChatUser.id === currentSelectedUser.id) {
            document.getElementById('active-chat-username').textContent = alias || currentSelectedUser.username;
        }
        
        closeUserOptionsModal();
    } catch (error) {
        console.error('Error saving user alias:', error);
    }
}

// Block user
async function blockUser() {
    if (!currentSelectedUser) return;
    
    try {
        await setDoc(doc(db, 'users', currentUser.uid), {
            blockedUsers: arrayUnion(currentSelectedUser.id)
        }, { merge: true });
        
        // Close the chat if it's with the blocked user
        if (currentChatUser && currentChatUser.id === currentSelectedUser.id) {
            currentChatUser = null;
            document.getElementById('active-chat-username').textContent = 'Select a chat';
            document.getElementById('message-input').placeholder = 'Type a message...';
            document.querySelector('.message-input').classList.remove('visible');
        }
        
        closeUserOptionsModal();
    } catch (error) {
        console.error('Error blocking user:', error);
    }
}

// Unblock user
async function unblockUser() {
    if (!currentSelectedUser) return;
    
    try {
        await setDoc(doc(db, 'users', currentUser.uid), {
            blockedUsers: arrayRemove(currentSelectedUser.id)
        }, { merge: true });
        
        closeUserOptionsModal();
    } catch (error) {
        console.error('Error unblocking user:', error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // ... existing event listeners ...
    
    // User options modal event listeners
    const userOptionsModal = document.getElementById('user-options-modal');
    const closeUserOptionsBtn = userOptionsModal.querySelector('.close-modal');
    const saveAliasBtn = document.getElementById('save-alias');
    const blockUserBtn = document.getElementById('block-user');
    const unblockUserBtn = document.getElementById('unblock-user');
    
    closeUserOptionsBtn.addEventListener('click', closeUserOptionsModal);
    saveAliasBtn.addEventListener('click', saveUserAlias);
    blockUserBtn.addEventListener('click', blockUser);
    unblockUserBtn.addEventListener('click', unblockUser);
    
    // Add click handler for the user options icon
    document.querySelector('.chat-header svg').addEventListener('click', () => {
        if (currentChatUser) {
            openUserOptionsModal(currentChatUser.id, currentChatUser.username);
        }
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === userOptionsModal) {
            closeUserOptionsModal();
        }
    });
});
