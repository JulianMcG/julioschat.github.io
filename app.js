let currentUser = null;
let currentChatUser = null;

// Profile Picture Upload
document.getElementById('profile-picture-preview').addEventListener('click', () => {
    document.getElementById('profile-picture-input').click();
});

document.getElementById('profile-picture-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('profile-picture-preview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Auth Functions
function showSignup() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
}

function showLogin() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

async function signup() {
    const username = document.getElementById('signup-username').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const profilePicture = document.getElementById('profile-picture-preview').src;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            profilePicture: profilePicture,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await userCredential.user.updateProfile({
            displayName: username,
            photoURL: profilePicture
        });

        showChatSection();
    } catch (error) {
        alert(error.message);
    }
}

async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        showChatSection();
    } catch (error) {
        alert(error.message);
    }
}

async function logout() {
    try {
        await auth.signOut();
        showAuthSection();
    } catch (error) {
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
        // Get all messages where current user is a participant
        const messagesSnapshot = await db.collection('messages')
            .where('participants', 'array-contains', currentUser.uid)
            .get();

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
            const userDoc = await db.collection('users').doc(userId).get();
            return {
                id: userId,
                ...userDoc.data()
            };
        });

        const users = await Promise.all(usersPromises);

        // Display users
        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            userElement.dataset.uid = user.id;
            userElement.innerHTML = `
                <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${user.username}" class="user-avatar">
                <span>${user.username}</span>
            `;
            userElement.onclick = () => startChat(user.id, user.username);
            usersContainer.appendChild(userElement);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function startChat(userId, username) {
    currentChatUser = { id: userId, username: username };
    
    // Update active user in sidebar
    const userItems = document.querySelectorAll('.user-item');
    userItems.forEach(item => {
        if (item.dataset.uid === userId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update chat header
    document.getElementById('active-chat-username').textContent = username;
    document.getElementById('active-chat-avatar').src = document.querySelector(`.user-item[data-uid="${userId}"] img`).src;

    // Load messages
    loadMessages();
}

async function loadMessages() {
    if (!currentChatUser) return;

    console.log('Loading messages for chat with:', currentChatUser.id);

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    try {
        // Query messages where both users are participants
        const messagesRef = db.collection('messages')
            .where('participants', 'array-contains', currentUser.uid)
            .orderBy('timestamp', 'asc');

        messagesRef.onSnapshot(snapshot => {
            console.log('Received message snapshot with', snapshot.size, 'messages');
            chatMessages.innerHTML = '';
            
            snapshot.forEach(doc => {
                const message = doc.data();
                console.log('Processing message:', message);
                
                // Only show messages between the current users
                if (message.participants.includes(currentChatUser.id)) {
                    const messageElement = document.createElement('div');
                    messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                    
                    const time = message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    
                    messageElement.innerHTML = `
                        <div class="content">${message.content}</div>
                        <div class="time">${time}</div>
                    `;
                    
                    chatMessages.appendChild(messageElement);
                }
            });
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, error => {
            console.error('Error in message snapshot:', error);
        });
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Check Firebase connection
function checkFirebaseConnection() {
    if (!firebase.apps.length) {
        console.error('Firebase is not initialized');
        return false;
    }
    return true;
}

async function sendMessage() {
    if (!currentUser) {
        alert('You must be logged in to send messages');
        return;
    }

    if (!currentChatUser) {
        alert('Please select a chat first');
        return;
    }

    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!content) return;

    try {
        // Create message in Firestore
        const messageData = {
            content: content,
            senderId: currentUser.uid,
            receiverId: currentChatUser.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            participants: [currentUser.uid, currentChatUser.id]
        };

        await db.collection('messages').add(messageData);
        
        // Clear input
        messageInput.value = '';

        // Add message to UI immediately
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = 'message sent';
        messageElement.innerHTML = `
            <div class="content">${content}</div>
            <div class="time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message: ' + error.message);
    }
}

// Add event listener for Enter key
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent form submission
        sendMessage();
    }
});

// Search Users with suggestions
document.getElementById('search-user').addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const usersContainer = document.getElementById('users-container');
    usersContainer.innerHTML = '';

    if (searchTerm.length > 0) {
        try {
            const usersSnapshot = await db.collection('users').get();
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

            // Sort suggestions by how close they match the search term
            suggestions.sort((a, b) => {
                const aIndex = a.username.toLowerCase().indexOf(searchTerm);
                const bIndex = b.username.toLowerCase().indexOf(searchTerm);
                return aIndex - bIndex;
            });

            // Display suggestions
            suggestions.forEach(user => {
                const userElement = document.createElement('div');
                userElement.className = 'user-item';
                userElement.dataset.uid = user.id;
                userElement.innerHTML = `
                    <img src="${user.profilePicture}" alt="${user.username}" class="user-avatar">
                    <span>${user.username}</span>
                `;
                userElement.onclick = () => {
                    startChat(user.id, user.username);
                    e.target.value = ''; // Clear search input
                };
                usersContainer.appendChild(userElement);
            });

            if (suggestions.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = 'No users found';
                usersContainer.appendChild(noResults);
            }
        } catch (error) {
            console.error('Error searching users:', error);
        }
    } else {
        // If search box is empty, show DM'd users
        loadUsers();
    }
});

// Remove the compose icon click handler since we're integrating it into the search
document.querySelector('.compose-icon').style.display = 'none';

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
auth.onAuthStateChanged(user => {
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
document.querySelector('.close-modal').addEventListener('click', closeSettingsModal);

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('settings-modal');
    if (event.target === modal) {
        closeSettingsModal();
    }
});

// Profile Picture Upload in Settings
document.getElementById('settings-profile-picture').addEventListener('click', () => {
    document.getElementById('settings-profile-picture-input').click();
});

document.getElementById('settings-profile-picture-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            // Create a storage reference
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`profile_pictures/${currentUser.uid}/${file.name}`);
            
            // Upload the file
            await fileRef.put(file);
            
            // Get the download URL
            const downloadURL = await fileRef.getDownloadURL();
            
            // Update the preview
            document.getElementById('settings-profile-picture').src = downloadURL;
            
            // Update Firebase Auth profile
            await currentUser.updateProfile({
                photoURL: downloadURL
            });
            
            // Update Firestore
            await db.collection('users').doc(currentUser.uid).update({
                profilePicture: downloadURL
            });
            
            // Update UI
            document.getElementById('current-user-avatar').src = downloadURL;
            
            alert('Profile picture updated successfully!');
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            alert('Error uploading profile picture. Please try again.');
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
        // First update Firebase Auth profile
        await currentUser.updateProfile({
            displayName: newUsername,
            photoURL: newProfilePicture
        });

        // Then update Firestore
        await db.collection('users').doc(currentUser.uid).update({
            username: newUsername,
            profilePicture: newProfilePicture
        });

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
