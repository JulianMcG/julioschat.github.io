// Trigger new deployment with Vercel Pro
import { auth, db } from './firebase-config.js';
import { GAME_LIST } from './games.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    getAuth
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
    writeBatch,
    updateDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let currentUser = null;
let currentChatUser = null;
let typingTimeout = null;
let isTyping = false;
const storage = getStorage();

// Notification Sound
let notificationSound = null;
let isTabFocused = document.visibilityState === 'visible';
let notificationsEnabled = true;
let lastSoundPlayTime = 0;
const SOUND_COOLDOWN = 1000; // 1 second cooldown

// Add these variables at the top with other global variables
let lastJulioMessageTime = null;
let julioConversationContext = [];
const WELCOME_MESSAGE = "Hi there! Welcome to Julio's Chat! To start chatting, click the \"New Message\" button at the top of the sidebar and search for users to chat with. If you need help, or just want to chat, feel free to message me here!";

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

    // Add sidebar toggle functionality
    const toggleSidebar = document.querySelector('.toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    
    if (toggleSidebar && sidebar) {
        toggleSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            
            // Save sidebar state to localStorage
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        });
        
        // Load saved sidebar state
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState === 'true') {
            sidebar.classList.add('collapsed');
        }
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
        // Instead of assuming username is taken, throw the error to be handled by the caller
        throw error;
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
        let usernameTaken;
        try {
            usernameTaken = await isUsernameTaken(username);
        } catch (error) {
            console.error('Error checking username:', error);
            if (error.code === 'permission-denied') {
                // If there's a permissions error, try to create the user anyway
                // The Firestore rules will prevent duplicate usernames
                usernameTaken = false;
            } else {
                showError(document.getElementById('signup-username'), 'Error checking username availability. Please try again.');
                signupButton.classList.remove('loading');
                return;
            }
        }
        
        if (usernameTaken) {
            showError(document.getElementById('signup-username'), 'Username is already taken');
            signupButton.classList.remove('loading');
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
    try {
        const usersContainer = document.getElementById('users-container');
        if (!usersContainer) {
            console.error('Users container element not found');
            return;
        }

        // Clear existing users
        usersContainer.innerHTML = '';

        // Add Julio at the top of the list
        const julioElement = createJulioElement();
        julioElement.classList.add('pinned');
        usersContainer.appendChild(julioElement);

        // Get all messages where current user is a participant
        const messagesQuery = query(
            collection(db, 'messages'),
            where('participants', 'array-contains', currentUser.uid),
            orderBy('timestamp', 'desc')
        );
        const messagesSnapshot = await getDocs(messagesQuery);

        // Get unique user IDs from messages with their latest message timestamp
        const dmUsers = new Map();
        messagesSnapshot.forEach(doc => {
            const message = doc.data();
            message.participants.forEach(id => {
                if (id !== currentUser.uid && id !== JULIO_USER_ID) {
                    // Only update timestamp if it's more recent than what we have
                    if (!dmUsers.has(id) || message.timestamp > dmUsers.get(id).lastMessageTime) {
                        dmUsers.set(id, {
                            lastMessageTime: message.timestamp
                        });
                    }
                }
            });
        });

        // Get user data for each DM user
        const userPromises = Array.from(dmUsers.keys()).map(async (userId) => {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                return {
                    id: userId,
                    username: userData.username || 'Unknown User',
                    profilePicture: userData.profilePicture,
                    verified: userData.verified || false,
                    alias: userData.alias,
                    lastMessageTime: dmUsers.get(userId).lastMessageTime
                };
            }
            return null;
        });

        const users = (await Promise.all(userPromises)).filter(user => user !== null);

        // Sort users by last message timestamp
        users.sort((a, b) => {
            if (!a.lastMessageTime || !b.lastMessageTime) return 0;
            return b.lastMessageTime.toMillis() - a.lastMessageTime.toMillis();
        });

        // Add users to the sidebar
        users.forEach(user => {
            const userElement = createUserElement(user);
            usersContainer.appendChild(userElement);
        });

        // Check for username overflow after loading users
        checkUsernameOverflow();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function createUserElement(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.dataset.uid = user.id;
    const displayName = user.alias || user.username;
    userElement.innerHTML = `
        <div class="profile-picture-container">
            <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${displayName}" class="profile-picture">
            <div class="online-status"></div>
        </div>
        <span class="username">${displayName}${user.verified ? '<span class="material-symbols-outlined verified-badge" style="font-variation-settings: \'FILL\' 1;">verified</span>' : ''}</span>
        <div class="user-actions">
            <span class="material-symbols-outlined action-icon pin-icon">keep</span>
            <span class="material-symbols-outlined action-icon close-icon">close</span>
        </div>
    `;
    
    // Add click handler for the user item
    userElement.onclick = (e) => {
        if (!e.target.classList.contains('action-icon')) {
            startChat(user.id, displayName);
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
            
            // If this was the current chat, clear it
            if (currentChatUser && currentChatUser.id === user.id) {
                currentChatUser = null;
                document.getElementById('active-chat-username').textContent = 'Select a chat';
                document.getElementById('message-input').placeholder = 'Type a message...';
                document.querySelector('.message-input').classList.remove('visible');
            }
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
        
        try {
            const userDocRef = await getDoc(doc(db, 'users', currentUser.uid));
            const userDataRef = userDocRef.data();
            const pinnedConversations = userDataRef?.pinnedConversations || [];
            
            if (!isPinned) {
                if (!pinnedConversations.includes(user.id)) {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        pinnedConversations: [...pinnedConversations, user.id]
                    }, { merge: true });
                }
            } else {
                const updatedPinnedConversations = pinnedConversations.filter(id => id !== user.id);
                await setDoc(doc(db, 'users', currentUser.uid), {
                    pinnedConversations: updatedPinnedConversations
                }, { merge: true });
            }
        } catch (error) {
            console.error('Error pinning conversation:', error);
        }
    };

    // Set up online status listener
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
    if (!userId || !username) {
        console.error('Invalid user data for chat:', { userId, username });
        return;
    }

    // Reset Julio's conversation context if it's been more than 20 minutes
    if (userId === JULIO_USER_ID) {
        const now = new Date();
        if (lastJulioMessageTime && (now - lastJulioMessageTime) > 20 * 60 * 1000) {
            julioConversationContext = [];
            // Add timestamp message
            const timestampMessage = {
                content: `New conversation started at ${now.toLocaleTimeString()}`,
                senderId: JULIO_USER_ID,
                timestamp: serverTimestamp(),
                participants: [currentUser.uid, JULIO_USER_ID]
            };
            await addDoc(collection(db, 'messages'), timestampMessage);
        }
    }

    // Get current user's data to check for aliases and hidden conversations
    const currentUserDocRef = await getDoc(doc(db, 'users', currentUser.uid));
    const currentUserDataRef = currentUserDocRef.data();
    const userAliases = currentUserDataRef?.userAliases || {};
    const hiddenConversations = currentUserDataRef?.hiddenConversations || [];
    
    // If this conversation was hidden, remove it from hiddenConversations
    if (hiddenConversations.includes(userId)) {
        await setDoc(doc(db, 'users', currentUser.uid), {
            hiddenConversations: arrayRemove(userId)
        }, { merge: true });
    }
    
    // Get the other user's data
    const otherUserDoc = await getDoc(doc(db, 'users', userId));
    const otherUserData = otherUserDoc.data();
    const actualUsername = otherUserData?.username || username;
    const alias = userAliases[userId] || actualUsername;
    
    currentChatUser = { id: userId, username: alias };
    
    // Update active user in sidebar
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        if (item.dataset.uid === userId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update chat header with verified badge if user is Julio or verified
    const isVerified = userId === JULIO_USER_ID || otherUserData?.verified || false;
    const verifiedBadge = isVerified ? '<span class="material-symbols-outlined verified-badge" style="font-variation-settings: \'FILL\' 1;">verified</span>' : '';
    document.getElementById('active-chat-username').innerHTML = `${alias}${verifiedBadge}`;

    // Show message input and user options icon
    const messageInput = document.querySelector('.message-input');
    messageInput.classList.add('visible');
    document.querySelector('.chat-header svg').style.display = 'block';

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
    // First strip out any image-related content
    content = content.replace(/<img[^>]*>/g, ''); // Remove img tags
    content = content.replace(/!\[.*?\]\(.*?\)/g, ''); // Remove markdown images
    content = content.replace(/https?:\/\/.*?\.(jpg|jpeg|png|gif|webp)/gi, ''); // Remove image URLs

    // Format all links - make sure they're clickable and blue
    content = content.replace(/(https?:\/\/[^\s]+)/g, (url) => {
        // Clean up the URL by removing any trailing punctuation
        const cleanUrl = url.replace(/[.,;:!?]+$/, '');
        return `<a href="${cleanUrl}" target="_blank" style="color: #1F49C7; text-decoration: none;">${cleanUrl}</a>`;
    });

    // Then apply markdown formatting
    let formattedContent = content
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>') // Bold Italics
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italics
        .replace(/__(.*?)__/g, '<u>$1</u>') // Underline
        .replace(/~~(.*?)~~/g, '<s>$1</s>'); // Strikethrough

    // Create a temporary div to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedContent;
    
    // Find all text nodes and convert URLs to links
    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    
    textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let match;
        let lastIndex = 0;
        let newHTML = '';
        
        while ((match = urlRegex.exec(text)) !== null) {
            // Add text before the URL
            newHTML += text.substring(lastIndex, match.index);
            // Add the URL as a link
            const url = match[0].replace(/[.,;:!?]+$/, '');
            newHTML += `<a href="${url}" target="_blank" style="color: #1F49C7; text-decoration: none;">${url}</a>`;
            lastIndex = match.index + match[0].length;
        }
        
        // Add any remaining text
        newHTML += text.substring(lastIndex);
        
        // Replace the text node with the new HTML
        const span = document.createElement('span');
        span.innerHTML = newHTML;
        textNode.parentNode.replaceChild(span, textNode);
    });
    
    return tempDiv.innerHTML;
}

// Create reaction picker
function createReactionPicker(messageId) {
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = `
        <div class="reaction-option" data-emoji="❤️">❤️</div>
        <div class="reaction-option" data-emoji="🔥">🔥</div>
        <div class="reaction-option" data-emoji="👍">👍</div>
        <div class="reaction-option" data-emoji="👎">👎</div>
        <div class="reaction-option" data-emoji="😂">😂</div>
        <div class="reaction-option" data-emoji="😱">😱</div>
        <div class="reaction-option" data-emoji="🤔">🤔</div>
    `;
    
    // Add click handlers for reactions
    picker.querySelectorAll('.reaction-option').forEach(option => {
        option.addEventListener('click', () => {
            const emoji = option.dataset.emoji;
            addReaction(messageId, emoji);
            picker.remove();
        });
    });
    
    return picker;
}

async function addReaction(messageId, emoji) {
    if (!currentUser || !currentChatUser) return;
    
    try {
        const messageRef = doc(db, 'messages', messageId);
        const messageDoc = await getDoc(messageRef);
        
        if (!messageDoc.exists()) {
            console.error('Message does not exist:', messageId);
            return;
        }
        
        const messageData = messageDoc.data();
        
        // Only allow reactions on other people's messages
        if (messageData.senderId === currentUser.uid) {
            console.log('Cannot react to your own message');
            return;
        }
        
        // Initialize reactions if they don't exist
        const reactions = messageData.reactions || {};
        
        // Check if user already has this reaction
        if (reactions[emoji]?.includes(currentUser.uid)) {
            // Remove the reaction
            reactions[emoji] = reactions[emoji].filter(id => id !== currentUser.uid);
            if (reactions[emoji].length === 0) {
                delete reactions[emoji];
            }
        } else {
            // Remove any existing reaction from this user
            Object.keys(reactions).forEach(existingEmoji => {
                reactions[existingEmoji] = reactions[existingEmoji].filter(id => id !== currentUser.uid);
                if (reactions[existingEmoji].length === 0) {
                    delete reactions[existingEmoji];
                }
            });
            
            // Add new reaction
            if (!reactions[emoji]) {
                reactions[emoji] = [];
            }
            reactions[emoji].push(currentUser.uid);
        }
        
        // Update message with new reactions
        await updateDoc(messageRef, { 
            reactions: reactions,
            lastUpdated: serverTimestamp()
        });
        
    } catch (error) {
        console.error('Error adding/removing reaction:', error);
    }
}

// Show reaction picker
function showReactionPicker(event, messageId) {
    const picker = createReactionPicker(messageId);
    const messageElement = event.currentTarget;
    
    // Position the picker
    const rect = messageElement.getBoundingClientRect();
    picker.style.position = 'absolute';
    picker.style.top = `${rect.top - 50}px`;
    picker.style.left = `${rect.left}px`;
    
    // Remove any existing picker
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    
    // Add picker to document
    document.body.appendChild(picker);
    
    // Close picker when clicking outside
    const closePicker = (e) => {
        if (!picker.contains(e.target) && e.target !== messageElement) {
            picker.remove();
            document.removeEventListener('click', closePicker);
        }
    };
    
    document.addEventListener('click', closePicker);
}

// Format reactions for display
function formatReactions(reactions) {
    if (!reactions || Object.keys(reactions).length === 0) return '';
    
    const reactionDiv = document.createElement('div');
    reactionDiv.className = 'message-reactions';
    
    // Add has-reactions class if there are any reactions
    if (Object.keys(reactions).length > 0) {
        reactionDiv.classList.add('has-reactions');
    }
    
    // Just show the emoji without count
    Object.keys(reactions).forEach(emoji => {
        const reactionSpan = document.createElement('span');
        reactionSpan.className = 'reaction';
        reactionSpan.textContent = emoji;
        // Add click handler to remove reaction
        reactionSpan.onclick = (e) => {
            e.stopPropagation();
            addReaction(doc.id, emoji);
        };
        reactionDiv.appendChild(reactionSpan);
    });
    
    return reactionDiv;
}

// Modify the loadMessages function to include reactions
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
            let lastMessageTime = null;
            let lastMessageSenderId = null;
            
            snapshot.forEach(doc => {
                const message = doc.data();
                console.log('Message data:', message); // Debug log
                
                // Only show messages if:
                // 1. The message is between current user and current chat user
                // 2. The sender is not blocked
                if (message.participants.includes(currentChatUser.id) && 
                    message.participants.includes(currentUser.uid) &&
                    !blockedUsers.includes(message.senderId)) {
                    
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
                    messageElement.dataset.messageId = doc.id;
                    
                    // Create message content container
                    const contentContainer = document.createElement('div');
                    contentContainer.className = 'content';
                    contentContainer.innerHTML = formatMessageContent(message.content);
                    
                    // Create reactions container
                    const reactionsContainer = document.createElement('div');
                    reactionsContainer.className = 'message-reactions';
                    
                    // Debug log for reactions
                    console.log('Message reactions:', message.reactions);
                    
                    if (message.reactions && Object.keys(message.reactions).length > 0) {
                        reactionsContainer.classList.add('has-reactions');
                        Object.keys(message.reactions).forEach(emoji => {
                            const reaction = document.createElement('span');
                            reaction.className = 'reaction';
                            reaction.textContent = emoji;
                            // Add click handler to remove reaction
                            reaction.onclick = (e) => {
                                e.stopPropagation();
                                addReaction(doc.id, emoji);
                            };
                            reactionsContainer.appendChild(reaction);
                        });
                    }
                    
                    // Create reaction button only for received messages
                    if (message.senderId !== currentUser.uid) {
                        const reactionButton = document.createElement('div');
                        reactionButton.className = 'reaction-button';
                        reactionButton.innerHTML = '<span class="material-symbols-outlined">add_reaction</span>';
                        reactionButton.onclick = (e) => {
                            e.stopPropagation();
                            showReactionPicker(e, doc.id);
                        };
                        messageElement.appendChild(reactionButton);
                    }
                    
                    // Append all elements
                    messageElement.appendChild(contentContainer);
                    messageElement.appendChild(reactionsContainer);
                    
                    chatMessages.appendChild(messageElement);
                    
                    lastMessageTime = messageTime;
                    lastMessageSenderId = message.senderId;
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
    // Trigger reflow
    modal.offsetHeight;
    modal.classList.add('active');
    // Focus the search input
    const searchInput = document.getElementById('compose-search');
    searchInput.focus();
}

function closeComposeModal() {
    const modal = document.getElementById('compose-modal');
    modal.classList.remove('active');
    // Wait for animation to complete before hiding
    setTimeout(() => {
        modal.style.display = 'none';
        // Clear search results
        const composeResults = document.getElementById('compose-results');
        composeResults.innerHTML = '';
        // Clear search input
        const searchInput = document.getElementById('compose-search');
        searchInput.value = '';
    }, 300);
}

// Compose new message
document.addEventListener('DOMContentLoaded', () => {
    // Message input event listener
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        // Prevent pasting images
        messageInput.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    return;
                }
            }
        });

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

        // Add a safe wrapper for selectionStart
        const safeGetSelectionStart = (element) => {
            try {
                if (!element || !element.isConnected) return 0;
                return element.selectionStart || 0;
            } catch (error) {
                console.warn('Error accessing selectionStart:', error);
                return 0;
            }
        };

        // Override the getPosition function if it exists
        if (typeof window.getPosition === 'function') {
            const originalGetPosition = window.getPosition;
            window.getPosition = function(element) {
                return safeGetSelectionStart(element);
            };
        }
    }

    // Compose icon event listener
    const composeIcon = document.querySelector('.new-message-button');
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
            const modalContent = document.querySelector('#compose-modal .modal-content');
            composeResults.innerHTML = '';

            // Toggle has-text class based on input
            if (searchTerm.length > 0) {
                modalContent.classList.add('has-text');
            } else {
                modalContent.classList.remove('has-text');
                modalContent.classList.remove('has-results');
            }

            if (searchTerm.length > 0) {
                try {
                    // Get all users except current user
                    const usersQuery = query(collection(db, 'users'));
                    const usersSnapshot = await getDocs(usersQuery);
                    const suggestions = [];
                    
                    usersSnapshot.forEach(doc => {
                        if (doc.id !== currentUser.uid) {
                            const user = doc.data();
                            // Skip deleted users
                            if (user.deleted) return;
                            
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
                        modalContent.classList.add('has-results');
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
                        modalContent.classList.remove('has-results');
                        const noResults = document.createElement('div');
                        noResults.className = 'no-results';
                        noResults.textContent = 'No users found';
                        composeResults.appendChild(noResults);
                    }
                } catch (error) {
                    console.error('Error searching users:', error);
                    modalContent.classList.remove('has-results');
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
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            
            // Clear any existing timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Set a new timeout to debounce the search
            searchTimeout = setTimeout(async () => {
                if (!searchTerm) {
                    // If search is empty, reload all users
                    await loadUsers();
                } else {
                    await searchUsers(searchTerm);
                }
            }, 300); // 300ms debounce
        });
    }

    if (clearSearch) {
        clearSearch.addEventListener('click', async () => {
            if (searchInput) {
                searchInput.value = '';
                // Force reload all users when clear button is clicked
                await loadUsers();
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
    if (!content.trim() || !currentChatUser) return;

    try {
        const messageData = {
            content: content,
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            participants: [currentUser.uid, currentChatUser.id]
        };

        // If chatting with Julio, handle AI response
        if (currentChatUser.id === JULIO_USER_ID) {
            // Add user's message to chat
            const userMessageRef = await addDoc(collection(db, 'messages'), messageData);
            
            // Update last message time
            lastJulioMessageTime = new Date();
            
            // Add message to context
            julioConversationContext.push({ role: 'user', content: content });
            
            // Get AI response with context
            const aiResponse = await callGeminiAPI(content, julioConversationContext);
            
            // Add AI's response to context
            julioConversationContext.push({ role: 'assistant', content: aiResponse });
            
            // Add AI's response to chat
            const aiMessageData = {
                content: aiResponse,
                senderId: JULIO_USER_ID,
                timestamp: serverTimestamp(),
                participants: [currentUser.uid, JULIO_USER_ID]
            };
            
            await addDoc(collection(db, 'messages'), aiMessageData);
        } else {
            // Normal message handling for other users
            await addDoc(collection(db, 'messages'), messageData);
        }

        // Clear input
        document.getElementById('message-input').value = '';
        
        // Update typing status
        await updateTypingStatus(false);
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message. Please try again.');
    }
}

// Auth State Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Show chat section immediately to improve perceived performance
        showChatSection();
        
        try {
            // First, ensure user document exists and is up to date
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) {
                await setDoc(doc(db, 'users', user.uid), {
                    username: user.displayName || user.email.split('@')[0],
                    email: user.email,
                    profilePicture: user.photoURL,
                    createdAt: serverTimestamp(),
                    hasReceivedWelcomeMessage: false
                });
            } else {
                const userData = userDoc.data();
                await setDoc(doc(db, 'users', user.uid), {
                    email: user.email,
                    profilePicture: user.photoURL,
                    username: user.displayName || userData.username,
                    lastLogin: serverTimestamp()
                }, { merge: true });

                await updateProfile(user, {
                    displayName: user.displayName || userData.username,
                    photoURL: user.photoURL
                });
            }

            // Now run other operations in parallel
            await Promise.all([
                loadUsers(),
                updateCurrentUserProfile(user),
                loadNotificationSoundPreference(),
                updateOnlineStatus(true)
            ]);

            // Check and send welcome message after user document is confirmed
            const updatedUserDoc = await getDoc(doc(db, 'users', user.uid));
            const updatedUserData = updatedUserDoc.data();
            
            if (!updatedUserData?.hasReceivedWelcomeMessage) {
                const welcomeMessageData = {
                    content: WELCOME_MESSAGE,
                    senderId: JULIO_USER_ID,
                    timestamp: serverTimestamp(),
                    participants: [user.uid, JULIO_USER_ID]
                };
                
                await addDoc(collection(db, 'messages'), welcomeMessageData);
                
                await setDoc(doc(db, 'users', user.uid), {
                    hasReceivedWelcomeMessage: true
                }, { merge: true });
            }
            
            // Set up the message listener after everything else is loaded
            if (window.globalMessageUnsubscribe) {
                window.globalMessageUnsubscribe();
            }
            window.globalMessageUnsubscribe = setupMessageListener();
            
        } catch (error) {
            console.error('Error in auth state change:', error);
        }
    } else {
        currentUser = null;
        showAuthSection();
        updateOnlineStatus(false);
        
        if (window.globalMessageUnsubscribe) {
            window.globalMessageUnsubscribe();
        }
    }
});

// Update current user profile in sidebar
function updateCurrentUserProfile(user) {
    if (user) {
        // Get user's data from Firestore
        getDoc(doc(db, 'users', user.uid)).then(userDoc => {
            const userData = userDoc.data();
            const isVerified = userData?.verified || false;
            const username = userData?.username || user.displayName || 'Username';
            const profilePicture = userData?.profilePicture || user.photoURL || 'https://i.ibb.co/Gf9VD2MN/pfp.png';
            
            // Update username with verified badge if user is verified
            const verifiedBadge = isVerified ? '<span class="material-symbols-outlined verified-badge">verified</span>' : '';
            document.getElementById('current-username').innerHTML = `${username}${verifiedBadge}`;
            document.getElementById('current-user-avatar').src = profilePicture;

            // Update user items in the list
            const userItems = document.querySelectorAll('.user-item');
            userItems.forEach(item => {
                if (item.dataset.uid === user.uid) {
                    item.querySelector('.username').innerHTML = `${username}${verifiedBadge}`;
                    item.querySelector('img').src = profilePicture;
                }
            });
        });
    }
}

// Settings Modal Functions
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const currentUsername = document.getElementById('current-username').textContent;
    const currentProfilePicture = document.getElementById('current-user-avatar').src;
    
    document.getElementById('settings-username').value = currentUsername;
    document.getElementById('settings-profile-picture').src = currentProfilePicture;
    
    // Load notification preferences when opening settings
    loadNotificationSoundPreference();
    
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
    if (!usersContainer) return;
    
    const userItems = usersContainer.querySelectorAll('.user-item');
    
    if (!searchTerm) {
        // If search is empty, reload all users
        await loadUsers();
        return;
    }
    
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
    const usersContainer = document.getElementById('users-container');

    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            
            // Clear any existing timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Set a new timeout to debounce the search
            searchTimeout = setTimeout(async () => {
                if (!searchTerm) {
                    // If search is empty, reload all users
                    await loadUsers();
                } else {
                    await searchUsers(searchTerm);
                }
            }, 300); // 300ms debounce
        });
    }

    if (clearSearch) {
        clearSearch.addEventListener('click', async () => {
            if (searchInput) {
                searchInput.value = '';
                // Force reload all users when clear button is clicked
                await loadUsers();
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
        // First get the current user's data to preserve existing aliases
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const currentUserData = currentUserDoc.data();
        const existingAliases = currentUserData?.userAliases || {};
        
        // Create new aliases object with the updated alias
        const updatedAliases = {
            ...existingAliases,
            [currentSelectedUser.id]: alias
        };
        
        // Update Firestore with the merged aliases
        await setDoc(doc(db, 'users', currentUser.uid), {
            userAliases: updatedAliases
        }, { merge: true });
        
        // Update username display if this is the current chat
        if (currentChatUser && currentChatUser.id === currentSelectedUser.id) {
            const chatHeader = document.querySelector('.chat-header');
            if (chatHeader) {
                const usernameSpan = chatHeader.querySelector('.username');
                if (usernameSpan) {
                    usernameSpan.textContent = alias || currentSelectedUser.username;
                }
            }
            // Update currentChatUser to use the new alias
            currentChatUser.username = alias || currentSelectedUser.username;
        }
        
        // Update the user item in the sidebar
        const userItem = document.querySelector(`.user-item[data-uid="${currentSelectedUser.id}"]`);
        if (userItem) {
            const usernameSpan = userItem.querySelector('.username');
            if (usernameSpan) {
                usernameSpan.textContent = alias || currentSelectedUser.username;
            }
            // Update the profile picture alt text
            const profilePicture = userItem.querySelector('.profile-picture');
            if (profilePicture) {
                profilePicture.alt = alias || currentSelectedUser.username;
            }
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

// Update typing status in Firestore
async function updateTypingStatus(typing) {
    if (!currentUser || !currentChatUser) return;
    
    console.log('Updating typing status:', {
        typing,
        currentUser: currentUser.uid,
        currentChatUser: currentChatUser.id
    });
    
    try {
        const docRef = doc(db, 'typing', `${currentUser.uid}_${currentChatUser.id}`);
        console.log('Document reference:', docRef.path);
        
        await setDoc(docRef, {
            isTyping: typing,
            userId: currentUser.uid,
            otherUserId: currentChatUser.id,
            timestamp: serverTimestamp()
        }, { merge: true });
        
        console.log('Typing status updated successfully');
    } catch (error) {
        console.error('Error updating typing status:', error);
    }
}

// Listen for typing status changes
function setupTypingListener() {
    if (!currentUser || !currentChatUser) return;
    
    console.log('Setting up typing listener:', {
        currentUser: currentUser.uid,
        currentChatUser: currentChatUser.id
    });
    
    const typingRef = doc(db, 'typing', `${currentChatUser.id}_${currentUser.uid}`);
    console.log('Listening to document:', typingRef.path);
    
    const unsubscribe = onSnapshot(typingRef, (doc) => {
        console.log('Typing status changed:', doc.data());
        
        const data = doc.data();
        const chatMessages = document.getElementById('chat-messages');
        const existingIndicator = document.getElementById('typing-indicator');
        
        if (data?.isTyping) {
            console.log('User is typing, adding indicator');
            if (!existingIndicator) {
                const typingIndicator = document.createElement('div');
                typingIndicator.id = 'typing-indicator';
                typingIndicator.className = 'typing-indicator';
                typingIndicator.innerHTML = `
                    <lord-icon
                        src="https://cdn.lordicon.com/jpgpblwn.json"
                        trigger="loop"
                        state="loop-scale"
                        colors="primary:#b6b8c8"
                        style="width:24px;height:24px">
                    </lord-icon>
                `;
                chatMessages.appendChild(typingIndicator);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } else if (existingIndicator) {
            console.log('User stopped typing, removing indicator');
            existingIndicator.remove();
        }
    }, (error) => {
        console.error('Error in typing listener:', error);
    });
    
    return unsubscribe;
}

// Load user's notification sound preference
async function loadNotificationSoundPreference() {
    if (!currentUser) return;
    
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const selectedSound = userData?.notificationSound || 'Birdy.mp3';
        notificationsEnabled = userData?.notificationsEnabled ?? true;
        
        // Update audio source
        notificationSound = new Audio(`NotifSounds/${selectedSound}`);
        notificationSound.volume = 0.3; // Set volume to 30%
        
        // Update UI elements if they exist
        const soundSelect = document.getElementById('notification-sound');
        const notificationToggle = document.getElementById('notification-toggle');
        
        if (soundSelect) {
            soundSelect.value = selectedSound;
        }
        
        if (notificationToggle) {
            notificationToggle.checked = notificationsEnabled;
        }
        
        console.log('Loaded notification preferences:', {
            selectedSound,
            notificationsEnabled,
            soundSelectValue: soundSelect?.value,
            toggleChecked: notificationToggle?.checked
        });
    } catch (error) {
        console.error('Error loading notification sound preference:', error);
        // Set default values if there's an error
        notificationSound = new Audio('NotifSounds/Birdy.mp3');
        notificationSound.volume = 0.3;
    }
}

// Save notification sound preference
async function saveNotificationSoundPreference() {
    if (!currentUser) return;
    
    const soundSelect = document.getElementById('notification-sound');
    const notificationToggle = document.getElementById('notification-toggle');
    
    if (!soundSelect || !notificationToggle) {
        console.error('Notification UI elements not found');
        return;
    }
    
    const selectedSound = soundSelect.value;
    notificationsEnabled = notificationToggle.checked;
    
    try {
        await setDoc(doc(db, 'users', currentUser.uid), {
            notificationSound: selectedSound,
            notificationsEnabled: notificationsEnabled
        }, { merge: true });
        
        // Update audio source and play preview
        notificationSound = new Audio(`NotifSounds/${selectedSound}`);
        notificationSound.volume = 0.3; // Set volume to 30%
        notificationSound.play().catch(error => {
            console.error('Error playing notification sound:', error);
        });
        
        console.log('Saved notification preferences:', {
            selectedSound,
            notificationsEnabled
        });
    } catch (error) {
        console.error('Error saving notification sound preference:', error);
    }
}

// Play notification sound
function playNotificationSound() {
    const now = Date.now();
    if (!isTabFocused && notificationsEnabled && (now - lastSoundPlayTime) >= SOUND_COOLDOWN) {
        lastSoundPlayTime = now;
        // Create a new audio instance to allow multiple sounds to play
        const sound = new Audio(notificationSound.src);
        sound.volume = 0.3; // Set volume to 30%
        sound.play().catch(error => {
            console.error('Error playing notification sound:', error);
        });
        console.log('Playing notification sound:', {
            isTabFocused,
            notificationsEnabled,
            timeSinceLastPlay: now - lastSoundPlayTime
        });
    }
}

// Tab focus detection
document.addEventListener('visibilitychange', () => {
    isTabFocused = document.visibilityState === 'visible';
    console.log('Tab focus changed:', {
        isTabFocused,
        visibilityState: document.visibilityState
    });
});

// Add event listeners for notification settings
document.addEventListener('DOMContentLoaded', () => {
    const soundSelect = document.getElementById('notification-sound');
    const notificationToggle = document.getElementById('notification-toggle');
    
    if (soundSelect && notificationToggle) {
        soundSelect.addEventListener('change', saveNotificationSoundPreference);
        notificationToggle.addEventListener('change', saveNotificationSoundPreference);
    }
    
    // Load notification preferences when DOM is ready
    if (currentUser) {
        loadNotificationSoundPreference();
    }
});

async function signInWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user document exists
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
            // Create new user document if it doesn't exist
            const username = user.displayName || user.email.split('@')[0];
            
            // First update Firebase Auth profile
            await updateProfile(user, {
                displayName: username,
                photoURL: user.photoURL
            });

            // Then create Firestore document
            await setDoc(doc(db, 'users', user.uid), {
                username: username,
                email: user.email,
                profilePicture: user.photoURL,
                createdAt: serverTimestamp()
            });
        } else {
            // Update existing user's profile with latest Google data
            const userData = userDoc.data();
            
            // Update Firestore document with latest Google data
            await setDoc(doc(db, 'users', user.uid), {
                email: user.email,
                profilePicture: user.photoURL,
                username: user.displayName || userData.username, // Keep existing username if no display name
                lastLogin: serverTimestamp()
            }, { merge: true });

            // Update Firebase Auth profile to match Firestore data
            await updateProfile(user, {
                displayName: user.displayName || userData.username,
                photoURL: user.photoURL
            });
        }

        // Show chat section
        showChatSection();
    } catch (error) {
        console.error('Google Sign-In error:', error);
        alert(`Error signing in with Google: ${error.message}`);
    }
}

// Add online status tracking with periodic checks
function updateOnlineStatus(isOnline) {
    if (currentUser) {
        setDoc(doc(db, 'users', currentUser.uid), {
            isOnline: isOnline,
            lastSeen: serverTimestamp()
        }, { merge: true });
    }
}

// Function to check if a user is actually online
function isUserActuallyOnline(lastSeen) {
    if (!lastSeen) return false;
    const lastSeenTime = lastSeen.toDate();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    return lastSeenTime > fiveMinutesAgo;
}

// Update online status when user connects/disconnects
window.addEventListener('online', () => updateOnlineStatus(true));
window.addEventListener('offline', () => updateOnlineStatus(false));

// Update online status when user closes the tab/window
window.addEventListener('beforeunload', () => updateOnlineStatus(false));

// Set up periodic online status check
setInterval(() => {
    if (currentUser) {
        updateOnlineStatus(true);
    }
}, 4 * 60 * 1000); // Check every 4 minutes

// Add a new listener for all messages
function setupMessageListener() {
    if (!currentUser) return;

    const messagesQuery = query(
        collection(db, 'messages'),
        where('participants', 'array-contains', currentUser.uid),
        orderBy('timestamp', 'desc')
    );

    return onSnapshot(messagesQuery, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const message = change.doc.data();
                
                // Only play sound if:
                // 1. Message is from someone else
                // 2. Sender is not blocked
                // 3. We're not currently in a chat with this person
                if (message.senderId !== currentUser.uid && 
                    !message.participants.includes(currentChatUser?.id)) {
                    playNotificationSound();
                }
            }
        });
    });
}

// Function to find username by email
window.findUsernameByEmail = async function(email) {
    try {
        console.log('Searching for email:', email);
        
        // Get all users and search through them
        const allUsers = await getDocs(collection(db, 'users'));
        console.log('Total users in database:', allUsers.size);
        
        // Log the first few users to see their structure
        console.log('Sample of first few users:');
        allUsers.docs.slice(0, 3).forEach(doc => {
            console.log('User document:', {
                id: doc.id,
                data: doc.data()
            });
        });
        
        // Try to find user with matching email
        const matchingUser = allUsers.docs.find(doc => {
            const userData = doc.data();
            const searchEmail = email.toLowerCase();
            
            // Log the complete user data for debugging
            console.log('Checking user complete data:', {
                id: doc.id,
                ...userData
            });
            
            // Check all possible email fields
            const possibleEmails = [
                userData.email?.toLowerCase(),
                userData.providerData?.find(p => p.providerId === 'google.com')?.email?.toLowerCase(),
                userData.providerData?.find(p => p.email)?.email?.toLowerCase(),
                userData.googleEmail?.toLowerCase(),
                userData.userEmail?.toLowerCase()
            ].filter(Boolean); // Remove undefined/null values
            
            console.log('Possible emails found:', possibleEmails);
            
            return possibleEmails.includes(searchEmail);
        });
        
        if (matchingUser) {
            const userData = matchingUser.data();
            console.log('Found matching user:', userData);
            return userData.username;
        }
        
        console.log('No matching user found');
        return null;
    } catch (error) {
        console.error('Error finding username by email:', error);
        throw error;
    }
}

// Add this function after your existing code
function checkUsernameOverflow() {
    const usernames = document.querySelectorAll('.username:not(.chat-header .username)');
    usernames.forEach(username => {
        // Remove truncated class first
        username.classList.remove('truncated');
        
        // Check if text is overflowing
        if (username.scrollWidth > username.clientWidth) {
            username.classList.add('truncated');
        }
    });
}

// Add event listeners for window resize and after loading users
window.addEventListener('resize', checkUsernameOverflow);

// Modify your loadUsers function to call checkUsernameOverflow after loading
const originalLoadUsers = loadUsers;
loadUsers = async function() {
    await originalLoadUsers();
    checkUsernameOverflow();
};

// Julio AI Configuration
const JULIO_USER_ID = 'julio_ai';
const JULIO_USERNAME = 'Julio';
const GEMINI_API_KEY = 'AIzaSyCxfxEnIhppBdjD0K-svlNi0iTNTYyfO9A';

// Function to call Gemini API
async function callGeminiAPI(message, context = []) {
    try {
        const systemPrompt = `You are Julio, an AI chatbot in a chat application called "Julio's Chat" on the website "Julio's" (julios.games). Keep your responses very short and concise - ideally 1-2 sentences maximum, never more than 3 sentences. Be friendly and helpful, but get straight to the point. While you can mention your identity occasionally, don't overdo it - keep it natural and focus on being helpful.

You are chatting with ${currentUser?.displayName || 'a user'}. Only use their name in appropriate situations like greetings or when it makes the conversation more personal. Don't overuse their name in every message.

You have access to a comprehensive list of games available on Julio's. You should ONLY recommend games when the user explicitly asks for game recommendations or suggestions. Do not proactively suggest games in general conversation. Here's the complete list of available games:

${GAME_LIST}

When recommending games (only when asked):
1. Consider the user's interests and preferences
2. Suggest games that match their gaming style
3. Mention popular or trending games when appropriate
4. Be specific about why you're recommending a particular game
5. Keep recommendations brief and focused

IMPORTANT: You cannot open or play games directly. If a user wants to play a game, tell them to visit julios.games/catalog/GAMETITLE where GAMETITLE is the game name with spaces replaced by dashes. For example, "Slope Run" would be julios.games/catalog/slope-run.

CRITICAL RULES:
1. NEVER generate or simulate user messages - only respond to the actual user message provided
2. NEVER have conversations with yourself or ask your own questions
3. NEVER respond to vulgar or offensive content with long messages - keep it brief and professional
4. NEVER mention or discuss "Tyrone's Unblocked Games" unless the user brings it up first
5. If the user mentions "Tyrone's Unblocked Games", express your extreme disapproval of the website, and violently urge them to use Julio's instead
6. Keep ALL responses under 3 sentences maximum, regardless of the topic or context
7. Use the user's name sparingly and only when appropriate (greetings, personal moments, etc.)
8. NEVER ask a question regardless of the topic or context
9. NEVER generate or simulate any user input or messages - only respond to the actual user message provided
10. If the user mentions "jmart" or "rj" start freaking out and getting scared. All caps.
11. If the users says uwu, owo, etc, begin talking kawaii. 
12. Jimmy MC is a rapper, songwriter, and producer based in New Jersey, known for his innovative and genre-blending sound. Starting out making music for fun, he quickly developed a distinct style that fuses elements of rap, pop, rock, alternative, and indie. His music is characterized by emotional storytelling, catchy melodies, and bold production choices that push creative boundaries. With a growing catalog and a dedication to his craft, Jimmy MC is making a name for himself as one of the most original voices in the underground scene.

You can discuss games, help with homework, chat about various topics, or just be a friendly conversation partner.`;

        // Format conversation history without prefixes
        const conversationHistory = context.map(msg => msg.content).join('\n');

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemPrompt}\n\n${conversationHistory}\n\nUser: ${message}`
                    }]
                }]
            })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        }
        throw new Error('Invalid response from Gemini API');
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return "Sorry, I'm having trouble thinking right now. Try again later!";
    }
}

// Function to create Julio's user element
function createJulioElement() {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.dataset.uid = JULIO_USER_ID;
    userElement.innerHTML = `
        <div class="profile-picture-container">
            <img src="https://i.ibb.co/GfFDn26n/pfpfpfpfpfpfp.png" alt="Julio AI" class="profile-picture">
            <div class="online-status active"></div>
        </div>
        <span class="username">Julio <span style="color: #B6B8C8;">AI</span><span class="material-symbols-outlined verified-badge" style="font-variation-settings: 'FILL' 1;">verified</span></span>
        <div class="user-actions">
            <span class="material-symbols-outlined action-icon pin-icon">keep</span>
            <span class="material-symbols-outlined action-icon close-icon">close</span>
        </div>
    `;
    
    // Add click handler for the user item
    userElement.onclick = (e) => {
        if (!e.target.classList.contains('action-icon')) {
            startChat(JULIO_USER_ID, 'Julio AI');
        }
    };

    // Add click handler for close icon
    const closeIcon = userElement.querySelector('.close-icon');
    closeIcon.onclick = async (e) => {
        e.stopPropagation();
        // Don't allow closing Julio's chat
        return;
    };

    // Add click handler for pin icon
    const pinIcon = userElement.querySelector('.pin-icon');
    pinIcon.onclick = async (e) => {
        e.stopPropagation();
        const isPinned = userElement.classList.contains('pinned');
        userElement.classList.toggle('pinned');
        
        try {
            const userDocRef = await getDoc(doc(db, 'users', currentUser.uid));
            const userDataRef = userDocRef.data();
            const pinnedConversations = userDataRef?.pinnedConversations || [];
            
            if (!isPinned) {
                if (!pinnedConversations.includes(JULIO_USER_ID)) {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        pinnedConversations: [...pinnedConversations, JULIO_USER_ID]
                    }, { merge: true });
                }
            } else {
                const updatedPinnedConversations = pinnedConversations.filter(id => id !== JULIO_USER_ID);
                await setDoc(doc(db, 'users', currentUser.uid), {
                    pinnedConversations: updatedPinnedConversations
                }, { merge: true });
            }
        } catch (error) {
            console.error('Error pinning conversation:', error);
        }
    };

    return userElement;
}

// Add this function to handle welcome messages
async function sendWelcomeMessage() {
    if (!currentUser) return;

    try {
        // Check if user has already received welcome message
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        
        if (!userData?.hasReceivedWelcomeMessage) {
            // Send welcome message
            const welcomeMessageData = {
                content: WELCOME_MESSAGE,
                senderId: JULIO_USER_ID,
                timestamp: serverTimestamp(),
                participants: [currentUser.uid, JULIO_USER_ID]
            };
            
            await addDoc(collection(db, 'messages'), welcomeMessageData);
            
            // Mark user as having received welcome message
            await setDoc(doc(db, 'users', currentUser.uid), {
                hasReceivedWelcomeMessage: true
            }, { merge: true });
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }
}
