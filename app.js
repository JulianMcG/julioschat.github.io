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

    // Emoji picker functionality
    const emojiButton = document.querySelector('.emoji-picker-button');
    const emojiPickerModal = document.getElementById('emoji-picker-modal');
    const emojiPicker = emojiPickerModal.querySelector('emoji-picker');
    const closeEmojiPicker = emojiPickerModal.querySelector('.close-modal');

    if (emojiButton && emojiPicker) {
        emojiButton.addEventListener('click', () => {
            emojiPickerModal.style.display = 'block';
        });

        closeEmojiPicker.addEventListener('click', () => {
            emojiPickerModal.style.display = 'none';
        });

        emojiPicker.addEventListener('emoji-click', (event) => {
            const emoji = event.detail.unicode;
            const input = document.getElementById('message-input');
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;
            
            input.value = text.substring(0, start) + emoji + text.substring(end);
            input.selectionStart = input.selectionEnd = start + emoji.length;
            input.focus();
        });

        // Close emoji picker when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === emojiPickerModal) {
                emojiPickerModal.style.display = 'none';
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
