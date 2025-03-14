const createUserBtn = document.getElementById("create-user");
const username = document.getElementById("username");
const allusersHtml = document.getElementById("allusers");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const endCallBtn = document.getElementById("end-call-btn");
const socket = io();
let localStream;
let caller = [];

let whiteboard,
  whiteboardContext,
  pencilTool,
  eraserTool,
  colorPicker,
  clearWhiteboardBtn,
  toggleWhiteboardBtn;
let isDrawing = false;
let currentTool = "pencil";
let currentColor = "#000000";
let lastX = 0;
let lastY = 0;
let isWhiteboardVisible = true;

const PeerConnection = (function () {
  let peerConnection;
  let whiteboardChannel;

  const createPeerConnection = () => {
    const config = {
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    };
    peerConnection = new RTCPeerConnection(config);

    try {
      whiteboardChannel = peerConnection.createDataChannel("whiteboard");
      setupWhiteboardChannel(whiteboardChannel);
    } catch (e) {
      console.error("Error creating data channel:", e);
    }

    peerConnection.ondatachannel = (event) => {
      if (event.channel.label === "whiteboard") {
        setupWhiteboardChannel(event.channel);
      }
    };

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = function (event) {
      remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = function (event) {
      if (event.candidate) {
        socket.emit("icecandidate", event.candidate);
      }
    };

    return peerConnection;
  };

  function setupWhiteboardChannel(channel) {
    channel.onopen = () => {
      console.log("Whiteboard data channel opened");
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWhiteboardData(data);
      } catch (e) {
        console.error("Error parsing whiteboard data:", e);
      }
    };

    channel.onclose = () => {
      console.log("Whiteboard data channel closed");
    };
  }

  function handleWhiteboardData(data) {
    if (data.type === "draw") {
      drawLine(
        data.x0,
        data.y0,
        data.x1,
        data.y1,
        data.color,
        data.lineWidth,
        data.isEraser
      );
    } else if (data.type === "clear") {
      clearWhiteboard();
    }
  }

  return {
    getInstance: () => {
      if (!peerConnection) {
        peerConnection = createPeerConnection();
      }
      return peerConnection;
    },

    reset: () => {
      if (peerConnection) {
        if (whiteboardChannel) {
          whiteboardChannel.close();
          whiteboardChannel = null;
        }
        peerConnection.close();
        peerConnection = null;
      }
    },

    sendWhiteboardData: (data) => {
      if (whiteboardChannel && whiteboardChannel.readyState === "open") {
        whiteboardChannel.send(JSON.stringify(data));
      }
    },
  };
})();

createUserBtn.addEventListener("click", (e) => {
  if (username.value !== "") {
    const usernameContainer = document.querySelector(".username-input");
    socket.emit("join-user", username.value);
    usernameContainer.style.display = "none";
  }
});
endCallBtn.addEventListener("click", (e) => {
  socket.emit("call-ended", caller);
});

socket.on("joined", (allusers) => {
  console.log({ allusers });
  const createUsersHtml = () => {
    allusersHtml.innerHTML = "";

    for (const user in allusers) {
      const li = document.createElement("li");
      li.textContent = `${user} ${user === username.value ? "(You)" : ""}`;

      if (user !== username.value) {
        const button = document.createElement("button");
        button.classList.add("call-btn");
        button.addEventListener("click", (e) => {
          startCall(user);
        });
        const img = document.createElement("img");
        img.setAttribute("src", "/images/phone.png");
        img.setAttribute("width", 20);

        button.appendChild(img);

        li.appendChild(button);
      }

      allusersHtml.appendChild(li);
    }
  };

  createUsersHtml();
});
socket.on("offer", async ({ from, to, offer }) => {
  const pc = PeerConnection.getInstance();

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { from, to, answer: pc.localDescription });
  caller = [from, to];
});
socket.on("answer", async ({ from, to, answer }) => {
  const pc = PeerConnection.getInstance();
  await pc.setRemoteDescription(answer);

  endCallBtn.style.display = "block";
  socket.emit("end-call", { from, to });
  caller = [from, to];
});
socket.on("icecandidate", async (candidate) => {
  console.log({ candidate });
  const pc = PeerConnection.getInstance();
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
});
socket.on("end-call", ({ from, to }) => {
  endCallBtn.style.display = "block";
});
socket.on("call-ended", (caller) => {
  endCall();
});

const startCall = async (user) => {
  console.log({ user });
  const pc = PeerConnection.getInstance();
  const offer = await pc.createOffer();
  console.log({ offer });
  await pc.setLocalDescription(offer);
  socket.emit("offer", {
    from: username.value,
    to: user,
    offer: pc.localDescription,
  });
};

const endCall = () => {
  PeerConnection.reset();
  endCallBtn.style.display = "none";

  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
    remoteVideo.srcObject = null;
  }

  if (whiteboardContext) {
    clearWhiteboard();
  }
};

function initWhiteboard() {
  whiteboard = document.getElementById("whiteboard");
  if (!whiteboard) return;

  whiteboardContext = whiteboard.getContext("2d");
  pencilTool = document.getElementById("pencil-tool");
  eraserTool = document.getElementById("eraser-tool");
  colorPicker = document.getElementById("color-picker");
  clearWhiteboardBtn = document.getElementById("clear-whiteboard");
  toggleWhiteboardBtn = document.getElementById("toggle-whiteboard");

  whiteboardContext.fillStyle = "white";
  whiteboardContext.fillRect(0, 0, whiteboard.width, whiteboard.height);
  whiteboardContext.lineJoin = "round";
  whiteboardContext.lineCap = "round";
  whiteboardContext.lineWidth = 2;

  whiteboard.addEventListener("mousedown", startDrawing);
  whiteboard.addEventListener("mousemove", draw);
  whiteboard.addEventListener("mouseup", stopDrawing);
  whiteboard.addEventListener("mouseout", stopDrawing);

  whiteboard.addEventListener("touchstart", handleTouch);
  whiteboard.addEventListener("touchmove", handleTouch);
  whiteboard.addEventListener("touchend", stopDrawing);

  pencilTool.addEventListener("click", () => setTool("pencil"));
  eraserTool.addEventListener("click", () => setTool("eraser"));
  colorPicker.addEventListener("input", (e) => setColor(e.target.value));
  clearWhiteboardBtn.addEventListener("click", () => {
    clearWhiteboard();

    PeerConnection.sendWhiteboardData({ type: "clear" });
  });

  toggleWhiteboardBtn.addEventListener("click", toggleWhiteboard);
}

function startDrawing(e) {
  isDrawing = true;
  const rect = whiteboard.getBoundingClientRect();

  if (e.type === "mousedown") {
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
  } else if (e.type === "touchstart" && e.touches.length === 1) {
    lastX = e.touches[0].clientX - rect.left;
    lastY = e.touches[0].clientY - rect.top;
  }
}

function draw(e) {
  if (!isDrawing) return;

  e.preventDefault();
  const rect = whiteboard.getBoundingClientRect();
  let currentX, currentY;

  if (e.type === "mousemove") {
    currentX = e.clientX - rect.left;
    currentY = e.clientY - rect.top;
  } else if (e.type === "touchmove" && e.touches.length === 1) {
    currentX = e.touches[0].clientX - rect.left;
    currentY = e.touches[0].clientY - rect.top;
  } else {
    return;
  }

  drawLine(
    lastX,
    lastY,
    currentX,
    currentY,
    currentTool === "eraser" ? "#FFFFFF" : currentColor,
    currentTool === "eraser" ? 20 : 2,
    currentTool === "eraser"
  );

  PeerConnection.sendWhiteboardData({
    type: "draw",
    x0: lastX,
    y0: lastY,
    x1: currentX,
    y1: currentY,
    color: currentTool === "eraser" ? "#FFFFFF" : currentColor,
    lineWidth: currentTool === "eraser" ? 20 : 2,
    isEraser: currentTool === "eraser",
  });

  lastX = currentX;
  lastY = currentY;
}

function drawLine(x0, y0, x1, y1, color, lineWidth, isEraser) {
  whiteboardContext.beginPath();
  whiteboardContext.moveTo(x0, y0);
  whiteboardContext.lineTo(x1, y1);
  whiteboardContext.strokeStyle = color;
  whiteboardContext.lineWidth = lineWidth;
  whiteboardContext.stroke();
  whiteboardContext.closePath();
}

function stopDrawing() {
  isDrawing = false;
}

function handleTouch(e) {
  e.preventDefault();

  const touch = e.touches[0];
  const mouseEvent = new MouseEvent(
    e.type === "touchstart" ? "mousedown" : "mousemove",
    {
      clientX: touch.clientX,
      clientY: touch.clientY,
    }
  );
  whiteboard.dispatchEvent(mouseEvent);
}

function setTool(tool) {
  currentTool = tool;

  pencilTool.classList.remove("active");
  eraserTool.classList.remove("active");

  if (tool === "pencil") {
    pencilTool.classList.add("active");
  } else if (tool === "eraser") {
    eraserTool.classList.add("active");
  }
}

function setColor(color) {
  currentColor = color;
}

function clearWhiteboard() {
  whiteboardContext.fillStyle = "white";
  whiteboardContext.fillRect(0, 0, whiteboard.width, whiteboard.height);
}

function toggleWhiteboard() {
  isWhiteboardVisible = !isWhiteboardVisible;

  const whiteboardContainer = document.querySelector(".whiteboard-container");
  const toggleWhiteboardBtn = document.getElementById("toggle-whiteboard");

  if (whiteboardContainer) {
    if (isWhiteboardVisible) {
      whiteboardContainer.style.display = "block";
      toggleWhiteboardBtn.textContent = "Hide Whiteboard";
    } else {
      whiteboardContainer.style.display = "none";
      toggleWhiteboardBtn.textContent = "Show Whiteboard";
    }
  }
}

const startMyVideo = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    console.log({ stream });
    localStream = stream;
    localVideo.srcObject = stream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  startMyVideo();

  setTimeout(() => {
    initWhiteboard();
  }, 500);
});
