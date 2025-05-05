// Group chat functionality
let selectedMembers = new Set();

// Initialize group chat functionality
function initGroupChat() {
    const createGroupButton = document.getElementById('create-group-button');
    const createGroupModal = document.getElementById('create-group-modal');
    const closeModal = createGroupModal.querySelector('.close-modal');
    const groupForm = document.querySelector('.group-form');
    const groupNameInput = document.getElementById('group-name');
    const memberSearchInput = document.getElementById('group-member-search');
    const selectedMembersContainer = document.getElementById('selected-members');
    const searchResults = document.getElementById('group-search-results');
    const createButton = groupForm.querySelector('button');

    // Open create group modal
    createGroupButton.addEventListener('click', () => {
        createGroupModal.style.display = 'block';
    });

    // Close create group modal
    closeModal.addEventListener('click', () => {
        createGroupModal.style.display = 'none';
        resetGroupForm();
    });

    // Handle member search
    memberSearchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.trim();
        if (searchTerm.length < 2) {
            searchResults.innerHTML = '';
            return;
        }

        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const users = [];
            
            usersSnapshot.forEach(doc => {
                if (doc.id !== currentUser.uid && !selectedMembers.has(doc.id)) {
                    const user = {
                        id: doc.id,
                        ...doc.data()
                    };
                    if (user.username.toLowerCase().includes(searchTerm.toLowerCase())) {
                        users.push(user);
                    }
                }
            });

            searchResults.innerHTML = '';
            users.forEach(user => {
                const userElement = document.createElement('div');
                userElement.className = 'compose-user-item';
                userElement.innerHTML = `
                    <img src="${user.profilePicture || 'https://i.ibb.co/Gf9VD2MN/pfp.png'}" alt="${user.username}" class="user-avatar">
                    <span>${user.username}</span>
                `;
                userElement.onclick = () => addMember(user);
                searchResults.appendChild(userElement);
            });
        } catch (error) {
            console.error('Error searching users:', error);
        }
    });

    // Add member to group
    function addMember(user) {
        if (selectedMembers.has(user.id)) return;
        
        selectedMembers.add(user.id);
        const memberElement = document.createElement('div');
        memberElement.className = 'selected-member';
        memberElement.innerHTML = `
            <span>${user.username}</span>
            <span class="material-symbols-outlined remove-member" data-user-id="${user.id}">close</span>
        `;
        selectedMembersContainer.appendChild(memberElement);
        
        // Remove member when clicking the remove button
        memberElement.querySelector('.remove-member').addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = e.target.dataset.userId;
            selectedMembers.delete(userId);
            memberElement.remove();
            updateCreateButton();
        });

        // Clear search
        memberSearchInput.value = '';
        searchResults.innerHTML = '';
        updateCreateButton();
    }

    // Update create button state
    function updateCreateButton() {
        createButton.disabled = !groupNameInput.value.trim() || selectedMembers.size < 2;
    }

    // Reset group form
    function resetGroupForm() {
        groupNameInput.value = '';
        memberSearchInput.value = '';
        selectedMembers.clear();
        selectedMembersContainer.innerHTML = '';
        searchResults.innerHTML = '';
        updateCreateButton();
    }

    // Handle group creation
    groupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!groupNameInput.value.trim() || selectedMembers.size < 2) return;

        try {
            // Create group document
            const groupData = {
                name: groupNameInput.value.trim(),
                creator: currentUser.uid,
                members: [...selectedMembers, currentUser.uid],
                createdAt: serverTimestamp()
            };

            const groupRef = await addDoc(collection(db, 'groups'), groupData);
            
            // Close modal and reset form
            createGroupModal.style.display = 'none';
            resetGroupForm();
            
            // Start group chat
            startGroupChat(groupRef.id, groupData.name);
        } catch (error) {
            console.error('Error creating group:', error);
        }
    });

    // Update create button on group name input
    groupNameInput.addEventListener('input', updateCreateButton);
}

// Start group chat
async function startGroupChat(groupId, groupName) {
    currentChatUser = { id: groupId, username: groupName, isGroup: true };
    
    // Update chat header
    document.getElementById('active-chat-username').innerHTML = `
        <span class="material-symbols-outlined group-icon">group</span>
        ${groupName}
    `;

    // Show message input
    const messageInput = document.querySelector('.message-input');
    messageInput.classList.add('visible');
    document.querySelector('.chat-header svg').style.display = 'block';

    // Load messages
    loadMessages();
}

// Load group messages
async function loadGroupMessages() {
    if (!currentUser || !currentChatUser) return;

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    try {
        const messagesQuery = query(
            collection(db, 'messages'),
            where('groupId', '==', currentChatUser.id),
            orderBy('timestamp', 'asc')
        );

        if (window.currentMessageUnsubscribe) {
            window.currentMessageUnsubscribe();
        }

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            chatMessages.innerHTML = '';
            let lastMessageTime = null;
            
            snapshot.forEach(doc => {
                const message = doc.data();
                const messageTime = message.timestamp.toDate();
                
                // Add timestamp or gap if needed
                if (lastMessageTime) {
                    const timeDiff = messageTime - lastMessageTime;
                    const twentyMinutes = 20 * 60 * 1000;
                    
                    if (timeDiff > twentyMinutes) {
                        addDateSeparator(messageTime);
                    }
                }
                
                const messageElement = createMessageElement(message, message.senderId === currentUser.uid);
                chatMessages.appendChild(messageElement);
                
                lastMessageTime = messageTime;
            });
            
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });

        window.currentMessageUnsubscribe = unsubscribe;
    } catch (error) {
        console.error('Error loading group messages:', error);
    }
}

// Send group message
async function sendGroupMessage(content) {
    if (!currentUser || !currentChatUser) return;
    
    if (!content) return;

    try {
        const messageData = {
            content: content,
            senderId: currentUser.uid,
            groupId: currentChatUser.id,
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, 'messages'), messageData);
        
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error sending group message:', error);
    }
}

// Initialize group chat when the page loads
document.addEventListener('DOMContentLoaded', initGroupChat); 