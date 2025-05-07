// Trigger new deployment with Vercel Pro
import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
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
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let currentUser = null;
let currentChatUser = null;
let typingTimeout = null;
let isTyping = false;
const storage = getStorage();

// Notification Sound
let notificationSound = new Audio('NotifSounds/Birdy.mp3');
let isTabFocused = document.visibilityState === 'visible';
let notificationsEnabled = true;
let lastSoundPlayTime = 0;
const SOUND_COOLDOWN = 1000; // 1 second cooldown

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
    const googleLoginButton = document.getElementById('google-login-button');
    const googleSignupButton = document.getElementById('google-signup-button');

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

    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', signInWithGoogle);
    }

    if (googleSignupButton) {
        googleSignupButton.addEventListener('click', signInWithGoogle);
    }
});

// Check if username exists
async function isUsernameTaken(username) {
    try {
        const usersQuery = query(collection(db, 'users'), where('username', '==', username));
        const usersSnapshot = await getDocs(usersQuery);
        return !usersSnapshot.empty;
    } catch (error) {
        console.error('Error checking username:', error);
        return true; // Return true on error to be safe
    }
}

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
        
        // Check if username is taken
        const usernameTaken = await isUsernameTaken(username);
        if (usernameTaken) {
            showError(document.getElementById('signup-username'), 'Username is already taken');
            return;
        }
        
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
        // Get current user's data
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (!currentUserDoc.exists()) {
            throw new Error('User document not found');
        }

        const currentUserData = currentUserDoc.data();
        const hiddenConversations = currentUserData?.hiddenConversations || [];
        const pinnedConversations = currentUserData?.pinnedConversations || [];
        const lastReadTimes = currentUserData?.lastReadTimes || {};

        // Get all messages where current user is a participant
        const messagesQuery = query(
            collection(db, 'messages'),
            where('participants', 'array-contains', currentUser.uid)
        );
        
        const messagesSnapshot = await getDocs(messagesQuery);
        const latestMessages = new Map();

        // Find the latest message for each conversation
        messagesSnapshot.forEach(doc => {
            const message = doc.data();
            if (!message.participants) return;

            const otherUserId = message.participants.find(id => id !== currentUser.uid);
            if (!otherUserId || hiddenConversations.includes(otherUserId)) return;

            const currentLatest = latestMessages.get(otherUserId);
            if (!currentLatest || message.timestamp > currentLatest.timestamp) {
                latestMessages.set(otherUserId, {
                    timestamp: message.timestamp,
                    content: message.content
                });
            }
        });

        if (latestMessages.size === 0) {
            const noUsersMessage = document.createElement('div');
            noUsersMessage.className = 'no-results';
            noUsersMessage.textContent = 'No conversations yet. Start a new chat!';
            usersContainer.appendChild(noUsersMessage);
            return;
        }

        // Get user details for each conversation
        const users = [];
        for (const [userId, messageData] of latestMessages) {
            try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (!userDoc.exists()) continue;

                const userData = userDoc.data();
                const lastReadTime = lastReadTimes[userId] ? new Date(lastReadTimes[userId]) : new Date(0);
                const messageTime = messageData.timestamp.toDate();
                const hasUnread = messageTime > lastReadTime;

                users.push({
                    id: userId,
                    username: userData.username || 'Unknown User',
                    profilePicture: userData.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png',
                    verified: userData.verified || false,
                    isPinned: pinnedConversations.includes(userId),
                    lastMessageTime: messageData.timestamp,
                    lastMessage: messageData.content,
                    hasUnread: hasUnread
                });
            } catch (error) {
                console.error(`Error loading user ${userId}:`, error);
            }
        }

        // Sort users: pinned first, then by last message time
        users.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            
            const timeA = a.lastMessageTime?.toDate?.() || new Date(0);
            const timeB = b.lastMessageTime?.toDate?.() || new Date(0);
            return timeB - timeA;
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
        const errorMessage = document.createElement('div');
        errorMessage.className = 'no-results';
        errorMessage.textContent = 'Error loading conversations. Please try again.';
        usersContainer.appendChild(errorMessage);
    }
}

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.innerHTML = `
        <div class="unread-indicator" style="display: ${user.hasUnread ? 'block' : 'none'}"></div>
        <div class="profile-picture-container">
            <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${user.username}" class="profile-picture">
            <div class="online-status"></div>
        </div>
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
            // Revert UI changes if save fails
            userElement.classList.toggle('pinned');
            if (!isPinned) {
                const usersContainer = document.getElementById('users-container');
                usersContainer.appendChild(userElement);
            }
        }
    };

    // Set up online status listener with improved logic
    const onlineStatusRef = doc(db, 'users', user.id);
    onSnapshot(onlineStatusRef, (doc) => {
        const userData = doc.data();
        const onlineStatus = userElement.querySelector('.online-status');
        if (userData?.isOnline && isUserActuallyOnline(userData.lastSeen)) {
            onlineStatus.classList.add('active');
        } else {
            onlineStatus.classList.remove('active');
        }
    });
    
    return userElement;
}

async function startChat(userId, username) {
    currentChatUser = { id: userId, username: username };
    
    // Update last read time in Firestore
    try {
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const currentUserData = currentUserDoc.data();
        const lastReadTimes = currentUserData?.lastReadTimes || {};
        
        lastReadTimes[userId] = new Date().toISOString();
        
        await setDoc(doc(db, 'users', currentUser.uid), {
            lastReadTimes: lastReadTimes
        }, { merge: true });
        
        // Clear unread indicator
        const userElement = document.querySelector(`.user-item[data-uid="${userId}"]`);
        if (userElement) {
            const unreadIndicator = userElement.querySelector('.unread-indicator');
            if (unreadIndicator) {
                unreadIndicator.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error updating last read time:', error);
    }
    
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
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                const userData = userDoc.data();
                const pinnedConversations = userData?.pinnedConversations || [];
                
                if (!isPinned) {
                    if (!pinnedConversations.includes(userId)) {
                        await setDoc(doc(db, 'users', currentUser.uid), {
                            pinnedConversations: [...pinnedConversations, userId]
                        }, { merge: true });
                    }
                } else {
                    const updatedPinnedConversations = pinnedConversations.filter(id => id !== userId);
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        pinnedConversations: updatedPinnedConversations
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

    // Set up typing listener
    if (window.currentTypingUnsubscribe) {
        window.currentTypingUnsubscribe();
    }
    window.currentTypingUnsubscribe = setupTypingListener();

    // Load messages
    loadMessages();
}

// Function to convert markdown-style formatting to HTML
function formatMessageContent(content) {
    // Replace markdown with HTML tags
    return content
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>') // Bold Italics
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italics
        .replace(/__(.*?)__/g, '<u>$1</u>') // Underline
        .replace(/~~(.*?)~~/g, '<s>$1</s>'); // Strikethrough
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

        // Mark all messages from this user as read
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
            let lastMessageTime = null;
            let lastMessageSenderId = null;
            
            snapshot.forEach(doc => {
                const message = doc.data();
                
                // Only show messages if:
                // 1. The message is between current user and current chat user
                // 2. The sender is not blocked
                if (message.participants.includes(currentChatUser.id) && 
                    message.participants.includes(currentUser.uid) &&
                    !blockedUsers.includes(message.senderId)) {
                    
                    // Play notification sound if message is from other user and tab is not focused
                    if (message.senderId !== currentUser.uid && !isTabFocused) {
                        playNotificationSound();
                    }
                    
                    const messageTime = message.timestamp.toDate();
                    
                    // Add timestamp or gap if needed
                    if (lastMessageTime) {
                        const timeDiff = messageTime - lastMessageTime;
                        const twentyMinutes = 20 * 60 * 1000; // 20 minutes in milliseconds
                        
                        if (timeDiff > twentyMinutes) {
                            // Add date separator
                            const dateSeparator = document.createElement('div');
                            dateSeparator.className = 'date-separator';
                            const today = new Date();
                            const messageDate = messageTime;
                            
                            let dateText;
                            if (messageDate.toDateString() === today.toDateString()) {
                                dateText = `Today ${messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                            } else if (messageDate.toDateString() === new Date(today - 86400000).toDateString()) {
                                dateText = `Yesterday ${messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                            } else {
                                dateText = messageDate.toLocaleDateString([], { 
                                    month: 'short', 
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                });
                            }
                            
                            dateSeparator.textContent = dateText;
                            chatMessages.appendChild(dateSeparator);
                        }
                    }
                    
                    const messageElement = document.createElement('div');
                    messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                    messageElement.innerHTML = `
                        <div class="content">${formatMessageContent(message.content)}</div>
                    `;
                    chatMessages.appendChild(messageElement);
                    
                    lastMessageTime = messageTime;
                    lastMessageSenderId = message.senderId;
                } else if (message.senderId !== currentUser.uid && !blockedUsers.includes(message.senderId)) {
                    // This is a message from another conversation
                    // Play notification sound if tab is not focused
                    if (!isTabFocused) {
                        playNotificationSound();
                    }

                    // Show unread indicator for the sender only if the message is newer than the last time we opened their chat
                    const userElement = document.querySelector(`.user-item[data-uid="${message.senderId}"]`);
                    if (userElement) {
                        const lastReadTime = userElement.dataset.lastReadTime ? new Date(userElement.dataset.lastReadTime) : new Date(0);
                        const messageTime = message.timestamp.toDate();
                        
                        if (messageTime > lastReadTime) {
                            const unreadIndicator = userElement.querySelector('.unread-indicator');
                            if (unreadIndicator) {
                                unreadIndicator.style.display = 'block';
                            }
                        }
                    }
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
                const content = messageInput.value.trim();
                if (content) {
                    messageInput.value = ''; // Clear input immediately
                    sendMessage(content); // Pass content to sendMessage
                    updateTypingStatus(false);
                }
            }
        });

        // Add typing status listeners
        messageInput.addEventListener('input', () => {
            if (!isTyping) {
                isTyping = true;
                updateTypingStatus(true);
            }
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                isTyping = false;
                updateTypingStatus(false);
            }, 1000);
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
                    const usersQuery = query(collection(db, 'users'));
                    const usersSnapshot = await getDocs(usersQuery);
                    const suggestions = [];
                    
                    usersSnapshot.forEach(doc => {
                        if (doc.id !== currentUser.uid) {
                            const user = doc.data();
                            const username = user.username?.toLowerCase() || '';
                            
                            if (username.includes(searchTerm)) {
                                suggestions.push({
                                    id: doc.id,
                                    username: user.username,
                                    profilePicture: user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png',
                                    verified: user.verified || false
                                });
                            }
                        }
                    });

                    // Sort suggestions by username
                    suggestions.sort((a, b) => a.username.localeCompare(b.username));

                    // Display suggestions
                    if (suggestions.length > 0) {
                        suggestions.forEach(user => {
                            const userElement = document.createElement('div');
                            userElement.className = 'compose-user-item';
                            userElement.innerHTML = `
                                <img src="${user.profilePicture}" alt="${user.username}" class="user-avatar">
                                <span>${user.username}${user.verified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : ''}</span>
                            `;
                            userElement.onclick = () => {
                                startChat(user.id, user.username);
                                closeComposeModal();
                            };
                            composeResults.appendChild(userElement);
                        });
                    } else {
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
async function sendMessage(content) {
    if (!currentUser || !currentChatUser) {
        console.log('No current user or chat user');
        return;
    }
    
    if (!content) {
        return;
    }

    try {
        // Get receiver's blocked users list
        const receiverDoc = await getDoc(doc(db, 'users', currentChatUser.id));
        const receiverData = receiverDoc.data();
        const receiverBlockedUsers = receiverData?.blockedUsers || [];

        if (receiverBlockedUsers.includes(currentUser.uid)) {
            alert('You cannot send messages to this user as they have blocked you.');
            return;
        }

        const timestamp = serverTimestamp();

        // Create message data
        const messageData = {
            content: content,
            senderId: currentUser.uid,
            receiverId: currentChatUser.id,
            participants: [currentUser.uid, currentChatUser.id],
            timestamp: timestamp
        };

        // Add message to Firestore
        await addDoc(collection(db, 'messages'), messageData);

        // Update last message time for both users
        const batch = writeBatch(db);
        
        // Update sender's last message time
        const senderRef = doc(db, 'users', currentUser.uid);
        batch.update(senderRef, {
            [`conversations.${currentChatUser.id}.lastMessageTime`]: timestamp,
            [`conversations.${currentChatUser.id}.lastMessage`]: content
        });

        // Update receiver's last message time
        const receiverRef = doc(db, 'users', currentChatUser.id);
        batch.update(receiverRef, {
            [`conversations.${currentUser.uid}.lastMessageTime`]: timestamp,
            [`conversations.${currentUser.uid}.lastMessage`]: content
        });

        // Commit the batch
        await batch.commit();
        
        // Scroll to bottom
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error sending message:', error);
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
        loadNotificationSoundPreference();
        updateOnlineStatus(true);
    } else {
        currentUser = null;
        showAuthSection();
        updateOnlineStatus(false);
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
    const usernameInput = document.getElementById('settings-username');

    // Clear previous errors
    clearErrorMessages();

    if (!newUsername) {
        showError(usernameInput, 'Please enter a username');
        return;
    }

    try {
        // Check if username is taken (and not by current user)
        const usernameTaken = await isUsernameTaken(newUsername);
        if (usernameTaken) {
            // Get the user with this username
            const usersQuery = query(collection(db, 'users'), where('username', '==', newUsername));
            const usersSnapshot = await getDocs(usersQuery);
            const userDoc = usersSnapshot.docs[0];
            
            // If the username is taken by someone else
            if (userDoc.id !== currentUser.uid) {
                showError(usernameInput, 'Username is already taken');
                return;
            }
        }

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
