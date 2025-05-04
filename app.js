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
    if (!currentUser || (!currentChatUser && !currentGroupChat)) {
        console.log('No current user or chat');
        return;
    }

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    try {
        // Get current user's blocked users list
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const currentUserData = currentUserDoc.data();
        const blockedUsers = currentUserData?.blockedUsers || [];

        let messagesQuery;
        if (currentGroupChat) {
            messagesQuery = query(
                collection(db, 'messages'),
                where('groupId', '==', currentGroupChat.id),
                orderBy('timestamp', 'asc')
            );
        } else {
            messagesQuery = query(
            collection(db, 'messages'),
            where('participants', 'array-contains', currentUser.uid),
            orderBy('timestamp', 'asc')
        );
        }

        if (window.currentMessageUnsubscribe) {
            window.currentMessageUnsubscribe();
        }

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            chatMessages.innerHTML = '';
            
            snapshot.forEach(doc => {
                const message = doc.data();
                
                // Only show messages if:
                // 1. The message is in the current chat
                // 2. The sender is not blocked
                if ((currentGroupChat && message.groupId === currentGroupChat.id) ||
                    (!currentGroupChat && message.participants.includes(currentChatUser.id) && 
                     message.participants.includes(currentUser.uid)) &&
                    !blockedUsers.includes(message.senderId)) {
                    
                    const messageElement = document.createElement('div');
                    messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'} ${currentGroupChat ? 'group' : ''}`;
                    
                    if (currentGroupChat) {
                        // Get sender's info
                        getDoc(doc(db, 'users', message.senderId)).then(senderDoc => {
                            const senderData = senderDoc.data();
                    messageElement.innerHTML = `
                                <div class="sender-info">
                                    <img src="${senderData.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${senderData.username}">
                                    <span class="sender-name">${senderData.username}</span>
                                </div>
                        <div class="content">${message.content}</div>
                    `;
                        });
                    } else {
                        messageElement.innerHTML = `
                            <div class="content">${message.content}</div>
                        `;
                    }
                    
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

// Group Chat State
let selectedUsers = new Set();
let currentGroupChat = null;
let selectedColor = '#1F49C7'; // Default color

// Initialize color picker
function initializeColorPicker() {
    const colorGrid = document.getElementById('color-grid');
    const colorItems = colorGrid.querySelectorAll('.color-item');
    
    colorItems.forEach(item => {
        const color = item.dataset.color;
        item.style.backgroundColor = color;
        
        item.onclick = () => {
            // Remove selected class from all items
            colorItems.forEach(i => i.classList.remove('selected'));
            // Add selected class to clicked item
            item.classList.add('selected');
            // Update selected color
            selectedColor = color;
        };
        
        // Select default color
        if (color === selectedColor) {
            item.classList.add('selected');
        }
    });
}

// Modify openGroupChatSettings to handle color
function openGroupChatSettings() {
    const modal = document.getElementById('group-chat-settings-modal');
    const groupMembersList = document.getElementById('group-members-list');
    const groupNameInput = document.getElementById('group-name');
    const groupEmojiInput = document.getElementById('group-emoji');
    groupMembersList.innerHTML = '';

    if (currentGroupChat) {
        // Editing existing group chat
        groupNameInput.value = currentGroupChat.name;
        groupEmojiInput.value = currentGroupChat.emoji;
        selectedColor = currentGroupChat.backgroundColor || '#1F49C7';
    } else {
        // Creating new group chat
        groupNameInput.value = '';
        groupEmojiInput.value = '🗑️';
        selectedColor = '#1F49C7';
    }

    // Initialize color picker
    initializeColorPicker();

    // Add current user
    const currentUserElement = document.createElement('div');
    currentUserElement.className = 'group-member';
    currentUserElement.innerHTML = `
        <img src="${currentUser.photoURL || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${currentUser.displayName}">
        <span class="username">${currentUser.displayName} (You)</span>
    `;
    groupMembersList.appendChild(currentUserElement);

    // Add other members
    const members = currentGroupChat ? currentGroupChat.members : Array.from(selectedUsers);
    members.forEach(async (userId) => {
        if (userId === currentUser.uid) return;
        
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();
        const userElement = document.createElement('div');
        userElement.className = 'group-member';
        userElement.innerHTML = `
            <img src="${userData.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${userData.username}">
            <span class="username">${userData.username}</span>
            <span class="material-symbols-outlined remove-member">close</span>
        `;
        
        userElement.querySelector('.remove-member').onclick = async () => {
            if (currentGroupChat) {
                // Update group chat in Firestore
                try {
                    await updateDoc(doc(db, 'groupChats', currentGroupChat.id), {
                        members: arrayRemove(userId)
                    });
                    
                    // Update local state
                    currentGroupChat.members = currentGroupChat.members.filter(id => id !== userId);
                } catch (error) {
                    console.error('Error removing member:', error);
                    alert('Error removing member. Please try again.');
                }
            } else {
                selectedUsers.delete(userId);
            }
            userElement.remove();
        };
        
        groupMembersList.appendChild(userElement);
    });

    modal.style.display = 'block';
}

// Modify saveGroupChatSettings to include background color
document.getElementById('save-group-settings').addEventListener('click', async () => {
    const groupName = document.getElementById('group-name').value.trim();
    const groupEmoji = document.getElementById('group-emoji').value.trim();

    if (!groupName) {
        alert('Please enter a group name');
        return;
    }

    if (!groupEmoji) {
        alert('Please select a group emoji');
        return;
    }

    try {
        if (currentGroupChat) {
            // Update existing group chat
            await updateDoc(doc(db, 'groupChats', currentGroupChat.id), {
                name: groupName,
                emoji: groupEmoji,
                backgroundColor: selectedColor
            });
            
            // Update local state
            currentGroupChat.name = groupName;
            currentGroupChat.emoji = groupEmoji;
            currentGroupChat.backgroundColor = selectedColor;
        } else {
            // Create new group chat
            const groupData = {
                name: groupName,
                emoji: groupEmoji,
                backgroundColor: selectedColor,
                members: [currentUser.uid, ...Array.from(selectedUsers)],
                createdAt: serverTimestamp()
            };

            const groupRef = await addDoc(collection(db, 'groupChats'), groupData);
            
            // Start the group chat
            currentGroupChat = {
                id: groupRef.id,
                name: groupName,
                emoji: groupEmoji,
                backgroundColor: selectedColor,
                members: groupData.members
            };
        }

        // Update UI
        document.getElementById('active-chat-username').innerHTML = `
            <span class="group-emoji" style="background-color: ${selectedColor}">${groupEmoji}</span>
            ${groupName}
        `;
        document.querySelector('.chat-header svg').style.display = 'block';

        closeGroupChatSettings();
        loadMessages();
    } catch (error) {
        console.error('Error saving group chat:', error);
        alert('Error saving group chat. Please try again.');
    }
});

// Close Group Chat Settings
function closeGroupChatSettings() {
    document.getElementById('group-chat-settings-modal').style.display = 'none';
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

    // Compose button event listener
    document.querySelector('.compose-icon').addEventListener('click', openComposeModal);
    
    // Close compose modal button
    document.querySelector('#compose-modal .close-modal').addEventListener('click', closeComposeModal);
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('compose-modal');
        if (event.target === modal) {
            closeComposeModal();
        }
    });

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
                            <span class="material-symbols-outlined select-user">${selectedUsers.has(user.id) ? 'check_circle' : 'radio_button_unchecked'}</span>
                        `;
                        
                        userElement.onclick = (e) => {
                            if (!e.target.classList.contains('select-user')) {
                                if (selectedUsers.has(user.id)) {
                                    selectedUsers.delete(user.id);
                                    updateSelectedUsers();
                                } else {
                                    selectedUsers.add(user.id);
                                    updateSelectedUsers();
                                }
                                userElement.querySelector('.select-user').textContent = 
                                    selectedUsers.has(user.id) ? 'check_circle' : 'radio_button_unchecked';
                            }
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

    // Function to update selected users display
    async function updateSelectedUsers() {
        const selectedUsersContainer = document.getElementById('selected-users');
        selectedUsersContainer.innerHTML = '';
        
        for (const userId of selectedUsers) {
            const userDoc = await getDoc(doc(db, 'users', userId));
            const userData = userDoc.data();
            
            const userElement = document.createElement('div');
            userElement.className = 'selected-user';
            userElement.innerHTML = `
                <span>${userData.username}</span>
                <span class="material-symbols-outlined remove-user">close</span>
            `;
            
            userElement.querySelector('.remove-user').onclick = () => {
                selectedUsers.delete(userId);
                updateSelectedUsers();
                // Update the checkmark in the search results
                const userItem = document.querySelector(`.compose-user-item[data-id="${userId}"]`);
                if (userItem) {
                    userItem.querySelector('.select-user').textContent = 'radio_button_unchecked';
                }
            };
            
            selectedUsersContainer.appendChild(userElement);
        }
    }

    // Update the start chat button functionality
    document.querySelector('.start-chat-button').onclick = async () => {
        if (selectedUsers.size === 0) {
            alert('Please select at least one user');
            return;
        }

        try {
            // Create group chat with default settings
            const members = [currentUser.uid, ...Array.from(selectedUsers)];
            const memberNames = [];
            
            // Get usernames for the group name
            for (const memberId of members) {
                const memberDoc = await getDoc(doc(db, 'users', memberId));
                const memberData = memberDoc.data();
                memberNames.push(memberData.username);
            }
            
            const groupData = {
                name: memberNames.join(', '),
                emoji: '🗑️',
                backgroundColor: '#1F49C7',
                members: members,
                createdAt: serverTimestamp()
            };
            
            const groupRef = await addDoc(collection(db, 'groupChats'), groupData);
            
            // Add the group chat to each member's groupChats array
            const updatePromises = members.map(async (memberId) => {
                const userRef = doc(db, 'users', memberId);
                await updateDoc(userRef, {
                    groupChats: arrayUnion(groupRef.id)
                });
            });
            
            await Promise.all(updatePromises);
            
            // Update local state
            currentGroupChat = {
                id: groupRef.id,
                ...groupData
            };
            
            // Close compose modal and clear selected users
            closeComposeModal();
            selectedUsers.clear();
            document.getElementById('selected-users').innerHTML = '';
            
            // Load the new chat
            loadChats();
        } catch (error) {
            console.error('Error creating group chat:', error);
            alert('Error creating group chat. Please try again.');
        }
    };
});

// Group Chat Settings Button
document.querySelector('.chat-header svg').addEventListener('click', () => {
    if (currentGroupChat) {
        openGroupChatSettings();
    } else if (currentChatUser) {
        openUserOptionsModal(currentChatUser.id, currentChatUser.username);
    }
});

// Emoji Picker
const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'];

function initializeEmojiPicker() {
    const emojiGrid = document.getElementById('emoji-grid');
    const emojiInput = document.getElementById('group-emoji');
    
    // Populate emoji grid
    emojis.forEach(emoji => {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji-item';
        emojiElement.textContent = emoji;
        emojiElement.onclick = () => {
            emojiInput.value = emoji;
            emojiGrid.classList.remove('active');
        };
        emojiGrid.appendChild(emojiElement);
    });
    
    // Show emoji grid when input is focused
    emojiInput.addEventListener('focus', () => {
        emojiGrid.classList.add('active');
    });
    
    // Hide emoji grid when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiInput.contains(e.target) && !emojiGrid.contains(e.target)) {
            emojiGrid.classList.remove('active');
        }
    });
}

// Initialize emoji picker when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeEmojiPicker();
});

// Send message
async function sendMessage(content) {
    if (!currentUser || (!currentChatUser && !currentGroupChat)) {
        console.log('No current user or chat');
        return;
    }
    
    if (!content) {
        return;
    }

    try {
        let messageData;
        if (currentGroupChat) {
            messageData = {
                content: content,
                senderId: currentUser.uid,
                groupId: currentGroupChat.id,
                timestamp: serverTimestamp()
            };
        } else {
        // Get receiver's blocked users list
        const receiverDoc = await getDoc(doc(db, 'users', currentChatUser.id));
        const receiverData = receiverDoc.data();
        const receiverBlockedUsers = receiverData?.blockedUsers || [];

        if (receiverBlockedUsers.includes(currentUser.uid)) {
            alert('You cannot send messages to this user as they have blocked you.');
            return;
        }

            messageData = {
            content: content,
            senderId: currentUser.uid,
            receiverId: currentChatUser.id,
            participants: [currentUser.uid, currentChatUser.id],
            timestamp: serverTimestamp()
        };
        }

        // Add message to Firestore
        const docRef = await addDoc(collection(db, 'messages'), messageData);
        console.log('Message sent successfully with ID:', docRef.id);
        
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
