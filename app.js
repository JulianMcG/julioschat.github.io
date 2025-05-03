let currentUser = null;
let currentChatUser = null;

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

    try {
        // Create user with email and password
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Add username to user profile
        await db.collection('users').doc(userCredential.user.uid).set({
            username: username,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update display name
        await userCredential.user.updateProfile({
            displayName: username
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
                userElement.textContent = user.username;
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
            .where('participants', 'array-contains', currentUser.uid)
            .where('participants', 'array-contains', currentChatUser.id)
            .orderBy('timestamp', 'asc');

        messagesRef.onSnapshot(snapshot => {
            chatMessages.innerHTML = '';
            snapshot.forEach(doc => {
                const message = doc.data();
                const messageElement = document.createElement('div');
                messageElement.className = 'message';
                messageElement.innerHTML = `
                    <div class="sender">${message.senderId === currentUser.uid ? 'You' : currentChatUser.username}</div>
                    <div class="content">${message.content}</div>
                    <div class="time">${new Date(message.timestamp.toDate()).toLocaleString()}</div>
                `;
                chatMessages.appendChild(messageElement);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

async function sendMessage() {
    if (!currentChatUser) return;

    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!content) return;

    try {
        await db.collection('messages').add({
            content: content,
            senderId: currentUser.uid,
            participants: [currentUser.uid, currentChatUser.id],
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Search Users
document.getElementById('search-user').addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const usersContainer = document.getElementById('users-container');
    const userItems = usersContainer.getElementsByClassName('user-item');

    Array.from(userItems).forEach(item => {
        const username = item.textContent.toLowerCase();
        item.style.display = username.includes(searchTerm) ? 'block' : 'none';
    });
});

// Auth State Listener
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        showChatSection();
    } else {
        currentUser = null;
        showAuthSection();
    }
}); 