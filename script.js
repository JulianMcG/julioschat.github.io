// Group Chat Functionality
const createGroupModal = document.getElementById('create-group-modal');
const addGroupIcon = document.querySelector('.add-group-icon');
const closeGroupModal = createGroupModal.querySelector('.close-modal');
const selectedUsersContainer = createGroupModal.querySelector('.selected-users');
const groupUserList = createGroupModal.querySelector('.user-list');
const createGroupButton = createGroupModal.querySelector('.create-button');

let selectedUsers = new Set();
const MAX_GROUP_SIZE = 10;

// Open create group modal
addGroupIcon.addEventListener('click', () => {
    createGroupModal.classList.add('active');
    populateGroupUserList();
});

// Close create group modal
closeGroupModal.addEventListener('click', () => {
    createGroupModal.classList.remove('active');
    resetGroupModal();
});

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    if (event.target === createGroupModal) {
        createGroupModal.classList.remove('active');
        resetGroupModal();
    }
});

// Populate user list in create group modal
function populateGroupUserList() {
    groupUserList.innerHTML = '';
    const users = document.querySelectorAll('.user-item:not(.blocked)');
    
    users.forEach(user => {
        const userId = user.dataset.userId;
        const username = user.querySelector('.username').textContent;
        const profilePicture = user.querySelector('.profile-picture').src;
        
        const userItem = document.createElement('div');
        userItem.className = `user-item ${selectedUsers.has(userId) ? 'selected' : ''}`;
        userItem.dataset.userId = userId;
        
        userItem.innerHTML = `
            <div class="checkbox">
                <span class="material-symbols-outlined">check</span>
            </div>
            <img src="${profilePicture}" alt="${username}" class="profile-picture">
            <span class="username">${username}</span>
        `;
        
        userItem.addEventListener('click', () => toggleUserSelection(userId, username, profilePicture));
        groupUserList.appendChild(userItem);
    });
}

// Toggle user selection in group creation
function toggleUserSelection(userId, username, profilePicture) {
    const userItem = groupUserList.querySelector(`[data-user-id="${userId}"]`);
    
    if (selectedUsers.has(userId)) {
        selectedUsers.delete(userId);
        userItem.classList.remove('selected');
        removeSelectedUser(userId);
    } else if (selectedUsers.size < MAX_GROUP_SIZE) {
        selectedUsers.add(userId);
        userItem.classList.add('selected');
        addSelectedUser(userId, username, profilePicture);
    }
    
    updateCreateButton();
}

// Add user to selected users container
function addSelectedUser(userId, username, profilePicture) {
    const selectedUser = document.createElement('div');
    selectedUser.className = 'selected-user';
    selectedUser.dataset.userId = userId;
    
    selectedUser.innerHTML = `
        <span>${username}</span>
        <span class="remove-user material-symbols-outlined">close</span>
    `;
    
    selectedUser.querySelector('.remove-user').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleUserSelection(userId, username, profilePicture);
    });
    
    selectedUsersContainer.appendChild(selectedUser);
}

// Remove user from selected users container
function removeSelectedUser(userId) {
    const selectedUser = selectedUsersContainer.querySelector(`[data-user-id="${userId}"]`);
    if (selectedUser) {
        selectedUser.remove();
    }
}

// Update create button state
function updateCreateButton() {
    createGroupButton.disabled = selectedUsers.size < 2;
}

// Reset group modal state
function resetGroupModal() {
    selectedUsers.clear();
    selectedUsersContainer.innerHTML = '';
    groupUserList.innerHTML = '';
    createGroupButton.disabled = true;
}

// Create group chat
createGroupButton.addEventListener('click', async () => {
    if (selectedUsers.size < 2) return;
    
    try {
        const groupMembers = Array.from(selectedUsers);
        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                members: groupMembers
            })
        });
        
        if (response.ok) {
            const group = await response.json();
            // Add group to sidebar
            addGroupToSidebar(group);
            // Close modal and reset
            createGroupModal.classList.remove('active');
            resetGroupModal();
        } else {
            throw new Error('Failed to create group');
        }
    } catch (error) {
        console.error('Error creating group:', error);
        // Show error message to user
    }
});

// Add group to sidebar
function addGroupToSidebar(group) {
    const groupItem = document.createElement('div');
    groupItem.className = 'user-item group';
    groupItem.dataset.groupId = group.id;
    
    groupItem.innerHTML = `
        <img src="${group.avatar || 'default-group-avatar.png'}" alt="${group.name}" class="profile-picture">
        <div class="username">${group.name}</div>
    `;
    
    groupItem.addEventListener('click', () => openGroupChat(group.id));
    document.querySelector('.users-list').prepend(groupItem);
}

// Open group chat
function openGroupChat(groupId) {
    // Clear current chat
    clearChat();
    
    // Set current chat to group
    currentChat = {
        type: 'group',
        id: groupId
    };
    
    // Load group messages
    loadGroupMessages(groupId);
}

// Load group messages
async function loadGroupMessages(groupId) {
    try {
        const response = await fetch(`/api/groups/${groupId}/messages`);
        if (response.ok) {
            const messages = await response.json();
            displayGroupMessages(messages);
        }
    } catch (error) {
        console.error('Error loading group messages:', error);
    }
}

// Display group messages
function displayGroupMessages(messages) {
    const chatMessages = document.querySelector('.chat-messages');
    let lastSenderId = null;
    
    messages.forEach(message => {
        const isConsecutive = message.senderId === lastSenderId;
        const messageElement = createGroupMessageElement(message, isConsecutive);
        chatMessages.appendChild(messageElement);
        lastSenderId = message.senderId;
    });
    
    scrollToBottom();
}

// Create group message element
function createGroupMessageElement(message, isConsecutive) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message group ${isConsecutive ? 'consecutive' : ''}`;
    
    messageDiv.innerHTML = `
        <div class="sender-info">
            ${!isConsecutive ? `
                <img src="${message.sender.avatar}" alt="${message.sender.username}" class="profile-picture">
                <div class="sender-name">${message.sender.username}</div>
            ` : ''}
        </div>
        <div class="message-content">
            <div class="content">${message.content}</div>
            <div class="timestamp">${formatTimestamp(message.timestamp)}</div>
        </div>
    `;
    
    return messageDiv;
} 
