// server.js (전체 덮어쓰기)
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 실제 서비스 시에는 도메인으로 제한하는 것이 좋습니다.
    methods: ["GET", "POST"]
  },
  // 안전망으로 100MB 제한(1e8)은 그대로 둡니다. (이제 보낼 일이 없겠지만요!)
  maxHttpBufferSize: 1e8 
});

io.on("connection", (socket) => {
  console.log("🟢 사용자 연결됨:", socket.id);
  
  // 방장이 PDF를 올려서 전체 페이지가 바뀌었을 때
  socket.on("sync-all-pages", (pages) => {
    if (socket.roomId) socket.to(socket.roomId).emit("receive-all-pages", pages);
  });

  // 방장이 다음/이전 페이지로 넘겼을 때
  socket.on("change-page", (pageIndex) => {
    if (socket.roomId) socket.to(socket.roomId).emit("sync-page", pageIndex);
  });

  // ✨ 1. 사용자가 특정 방에 입장할 때 처리
  socket.on("join-room", ({ roomId, role, userName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = role;
    socket.userName = userName;
    
    console.log(`🚪 [${roomId}] 방에 ${userName}(${role}) 입장완료`);

    // 🔥 다중 방장 충돌 해결: 방에 있는 사람 중 '방장 1명'만 찾아서 그 사람에게만 동기화 요청!
    const roomClients = io.sockets.adapter.rooms.get(roomId);
    let masterTeacherId = null;

    if (roomClients) {
      for (const clientId of roomClients) {
        const clientSocket = io.sockets.sockets.get(clientId);
        // 나 자신을 제외하고, 역할이 'host'인 사람을 딱 1명만 찾으면 바로 멈춤(break)
        if (clientSocket && clientSocket.role === "host" && clientId !== socket.id) {
          masterTeacherId = clientId;
          break; 
        }
      }
    }

    // 대표 방장을 찾았다면, 그 방장의 컴퓨터(소켓)에만 콕 집어서 요청함!
    if (masterTeacherId) {
      io.to(masterTeacherId).emit("request-sync", socket.id);
    }
  });

  // 🔥 2. 지각생 동기화 짐 배달 (구조 개편!)
  // 이제 프론트엔드가 roomState, pages 등 아주 많은 정보를 묶어서 보내므로, 특정 변수만 꼽지 않고 통째로 넘겨줍니다.
  socket.on("send-sync", (data) => {
    // data 안에는 { targetId, roomState, canvasData, steps, pages, currentPageIndex } 가 다 들어있습니다.
    io.to(data.targetId).emit("receive-sync", data);
  });

  // 🚀 3. [신규] 방장의 칠판 통제 명령 중계 차선! (수업모드, 투명도, 필기 끄기 등)
  socket.on("update-room-state", (newState) => {
    if (socket.roomId) {
      // 나(방장)를 제외한 방 안의 모든 학생들에게 즉시 통제 명령 하달!
      socket.to(socket.roomId).emit("update-room-state", newState);
    }
  });

  // ✨ 4. 선이나 도형을 그렸을 때 (방 사람들에게만 전송)
  socket.on("draw", (pathData) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("draw", pathData);
    }
  });

  // ✨ 5. 레이어(스텝) 투명도나 눈알을 껐다 켰을 때
  socket.on("sync-steps", (steps) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("sync-steps", steps);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 사용자 연결 해제:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("🚀 Socket.io 서버가 3001번 포트에서 실행 중입니다.");
});