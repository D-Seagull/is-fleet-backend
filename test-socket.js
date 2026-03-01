const { io } = require('socket.io-client');

const socket = io('http://localhost:2024');

socket.on('connect', () => {
  console.log('Connected:', socket.id);

  socket.emit('joinTrip', '324068a1-aa93-4405-bf2a-2db4c4f758d4');

  socket.emit('sendMessage', {
    tripId: '324068a1-aa93-4405-bf2a-2db4c4f758d4',
    content: 'Тест повідомлення',
    senderId: 'dab32df1-a1bf-4f39-ad8a-3e46601b6839',
  });
});

socket.on('newMessage', (message) => {
  console.log('New message:', message);
});
