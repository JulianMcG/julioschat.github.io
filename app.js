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
        const usersSnapshot = await db.collection('users').get();
        usersSnapshot.forEach(doc => {
            if (doc.id !== currentUser.uid) {
                const user = doc.data();
                const userElement = document.createElement('div');
                userElement.className = 'user-item';
                userElement.innerHTML = `
                    <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${user.username}" class="user-avatar">
                    <span>${user.username}</span>
                `;
                userElement.onclick = () => startChat(doc.id, user.username);
                usersContainer.appendChild(userElement);
            }
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function startChat(userId, username) {
    currentChatUser = { id: userId, username: username };
    document.getElementById('chat-messages').innerHTML = '';
    loadMessages();
}

async function loadMessages() {
    if (!currentChatUser) return;

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    try {
        const messagesRef = db.collection('messages')
            .where('senderId', 'in', [currentUser.uid, currentChatUser.id])
            .where('receiverId', 'in', [currentUser.uid, currentChatUser.id])
            .orderBy('timestamp', 'asc');

        messagesRef.onSnapshot(snapshot => {
            chatMessages.innerHTML = '';
            snapshot.forEach(doc => {
                const message = doc.data();
                const messageElement = document.createElement('div');
                messageElement.className = `message ${message.senderId === currentUser.uid ? 'sent' : 'received'}`;
                
                const time = message.timestamp ? new Date(message.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                
                messageElement.innerHTML = `
                    <div class="content">${message.content}</div>
                    <div class="time">${time}</div>
                `;
                
                chatMessages.appendChild(messageElement);
            });
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Send message on Enter key
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

async function sendMessage() {
    if (!currentChatUser) return;

    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!content) return;

    try {
        // Create message in Firestore
        await db.collection('messages').add({
            content: content,
            senderId: currentUser.uid,
            receiverId: currentChatUser.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Clear input
        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message. Please try again.');
    }
}

// Search Users
document.getElementById('search-user').addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const usersContainer = document.getElementById('users-container');
    const userItems = usersContainer.getElementsByClassName('user-item');

    // Clear previous suggestions
    usersContainer.innerHTML = '';

    if (searchTerm.length > 0) {
        try {
            const usersSnapshot = await db.collection('users').get();
            const suggestions = [];
            
            usersSnapshot.forEach(doc => {
                if (doc.id !== currentUser.uid) {
                    const user = doc.data();
                    const username = user.username.toLowerCase();
                    
                    // Check if username contains the search term
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
                userElement.onclick = () => startChat(user.id, user.username);
                usersContainer.appendChild(userElement);
            });

            // If no suggestions found, show a message
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
        // If search box is empty, show all users
        loadUsers();
    }
});

// Compose new message
document.querySelector('.compose-icon').addEventListener('click', () => {
    const username = prompt('Enter username to message:');
    if (username) {
        // Find user by username and start chat
        db.collection('users')
            .where('username', '==', username)
            .get()
            .then(snapshot => {
                if (!snapshot.empty) {
                    const user = snapshot.docs[0];
                    startChat(user.id, user.data().username);
                } else {
                    alert('User not found');
                }
            })
            .catch(error => {
                console.error('Error finding user:', error);
                alert('Error finding user');
            });
    }
});

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

document.getElementById('settings-profile-picture-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('settings-profile-picture').src = e.target.result;
        };
        reader.readAsDataURL(file);
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
