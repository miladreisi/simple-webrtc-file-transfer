let localConnection = null;
let sendDataChannel = null;
let receiveDataChannel = null;
let socket = null;
let socketConnected = false;
let sendDataChannelOpen = false;
let username = null;
let peerUsername = null;

let receivedFileData = [];
let receivedFileMetaData = {
  name: null,
  size: null,
  type: null,
  numberOfChunks: null
};

jQuery(document).ready($ => {
  $("#connectToServerBtn").click(() => {
    username = $("#usernameTxt").val();
    if (username == "") {
      alert("enter username");
      return;
    }

    socket = io("https://192.168.1.189:3000", {
      rejectUnauthorized: false
    });
    socket.on("connect", () => {
      socketConnected = true;
      console.log("connected");
      displayMsg("connected");

      socket.emit("login", {
        username: username
      });
    });

    socket.on("info", info => displayMsg(info));
    socket.on("error", error => dispalyErr(error));

    socket.on("usersList", users => {
      console.log(users);
      $("#usersList").html("");
      users.forEach(currUsername => {
        if (username == currUsername) {
          return;
        }
        $("#usersList").append(
          `<option value='${currUsername}'>${currUsername}</option>`
        );
      });
    });
    socket.on("disconnect", () => {
      socketConnected = false;
      console.log("disconnected");
    });

    socket.on("msg", msg => {
      handleSignalingMsg(msg);
    });
  });

  $("#connectToPeerBtn").click(function() {
    initLocalConnection();

    localConnection.createOffer().then(offer => {
      localConnection.setLocalDescription(offer);
      console.log("sending offer");
      console.log(offer);
      displayMsg("Connecting to peer");

      peerUsername = $("#usersList").val();
      socket.emit("msg", {
        type: "offer",
        data: offer,
        from: username,
        to: peerUsername
      });
    });
  });

  $("#sendBtn").click(() => {
    if (
      localConnection.iceConnectionState != "connected" &&
      localConnection.iceConnectionState != "completed"
    ) {
      alert("Please Connect To Peer First");
      return;
    }
    let fileInput = document.getElementById("inputfile");
    if (fileInput.files.length == 0) {
      alert("Please Select File To Send First");
      return;
    }

    let fileToSend = fileInput.files[0];
    displayMsg("Sending...");
    let eachChunkSize = 102400;
    let numberOfChunks = parseInt(fileToSend.size / eachChunkSize) + 1;
    sendDataChannel.send(
      JSON.stringify({
        name: fileToSend.name,
        size: fileToSend.size,
        type: fileToSend.type,
        numberOfChunks: numberOfChunks
      })
    );

    let numberOfSentChunks = 0;
    for (let start = 0; start <= fileToSend.size; start += eachChunkSize) {
      let fileReader = new FileReader();
      fileReader.onloadend = event => {
        console.log("onloaded");
        if (event.target.readyState == FileReader.DONE) {
          console.log(`from ${start} to ${start + eachChunkSize} loaded`);
          let chunkNumber = start / eachChunkSize;
          displayMsg(`Sending chunk ${chunkNumber} of ${numberOfChunks}`);
          sendDataChannel.send(event.target.result);
          numberOfSentChunks++;
          if (numberOfSentChunks == numberOfChunks) {
            displayMsg("File Sent Successfully");
          }
        }
      };

      let end = start + eachChunkSize;
      if (end > fileToSend.size) {
        end = fileToSend.size + 1; // reading last byte
      }
      let chunk = fileToSend.slice(start, end);
      fileReader.readAsArrayBuffer(chunk);
    }
  });

  function displayMsg(msg) {
    $("#resultTxt").append(`<span style='color:green'>${msg}</span><br/>`);
  }

  function dispalyErr(err) {
    $("#resultTxt").append(`<span style='color:red'>${err}</span><br/>`);
  }
  $("#inputTxt").keyup(e => {
    if (e.which == 13) {
      sendMsg();
    }
  });

  // $('#sendBtn').click(() => {
  //     sendMsg()
  // })

  function sendMsg() {
    let txt = $("#inputTxt").val();
    sendDataChannel.send(txt);
    $("#chatTxt").append("<span>Me: </span>" + txt + "<br/>");
    $("#inputTxt")
      .val("")
      .focus();
  }

  function receiveDatachannelCreatedCallback(event) {
    console.log("receiveDatachannelCreatedCallback");
    receiveDataChannel = event.channel;
    receiveDataChannel.onmessage = receiveDataChannelOnMsgCallback;
    receiveDataChannel.onopen = receiveDataChannelOnOpenCallback;
    receiveDataChannel.onclose = receiveDataChannelOncloseCallback;
  }

  function receiveDataChannelOnMsgCallback(event) {
    handleReceivedFile(event.data);
    // $('#chatTxt').append(event.data + '<br/>')
  }

  function receiveDataChannelOnOpenCallback() {
    console.log("receiveDataChannelOnOpenCallback");
  }

  function receiveDataChannelOncloseCallback() {
    console.log("receiveDataChannelOncloseCallback");
  }

  function sendDataChannelOpenCallback(event) {
    console.log("sendDataChannel open event");
    sendDataChannelOpen = true;
  }

  function sendDataChannelCloseCallback(event) {
    console.log("sendDataChannel close event");
    sendDataChannelOpen = false;
  }

  function initLocalConnection() {
    if (localConnection != null) {
      return;
    }

    localConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302"
        }
      ]
    });

    localConnection.ondatachannel = receiveDatachannelCreatedCallback;
    sendDataChannel = localConnection.createDataChannel("myDataChannel");
    sendDataChannel.onopen = sendDataChannelOpenCallback;
    sendDataChannel.onclose = sendDataChannelCloseCallback;

    localConnection.onicecandidate = e => {
      if (e.candidate) {
        socket.emit("msg", {
          type: "candidate",
          data: e.candidate,
          from: username,
          to: peerUsername
        });
      }
    };

    localConnection.oniceconnectionstatechange = event => {
      console.log("oniceconnectionstatechange");
      switch (localConnection.iceConnectionState) {
        case "connected":
          // case 'completed':
          displayMsg("Peer Connection Connected");
          break;
        case "disconnected":
          dispalyErr("Peer Connection Disconnected");
          break;
      }
    };
  }

  function handleReceivedFile(fileData) {
    try {
      let data = JSON.parse(fileData);
      receivedFileMetaData = data;
    } catch (itsNotJson) {
      receivedFileData.push(fileData);
      displayMsg(
        `Received chunk ${receivedFileData.length} of ${
          receivedFileMetaData.numberOfChunks
        }`
      );
      if (receivedFileData.length == receivedFileMetaData.numberOfChunks) {
        fileReceiveEnded();
      }
    }
  }

  function fileReceiveEnded() {
    let fileBlob = new Blob(receivedFileData, {
      type: receivedFileMetaData.type
    });
    let linkToDownload = document.createElement("a");
    linkToDownload.setAttribute("href", window.URL.createObjectURL(fileBlob));
    linkToDownload.setAttribute("download", receivedFileMetaData.name);
    linkToDownload.innerText =
      "Click Here To Download " + receivedFileMetaData.name;
    $("#resultTxt").append(linkToDownload);

    receivedFileMetaData = {};
    receivedFileData = [];
  }

  function handleSignalingMsg(msg) {
    console.log("msg from signaling");
    console.log(msg);
    peerUsername = msg.from;

    switch (msg.type) {
      case "candidate":
        if (localConnection == null) {
          initLocalConnection();
        }
        localConnection.addIceCandidate(msg.data);
        break;
      case "offer":
        if (localConnection == null) {
          initLocalConnection();
        }
        localConnection.setRemoteDescription(msg.data);
        localConnection.createAnswer().then(answer => {
          localConnection.setLocalDescription(answer);
          console.log("sending answer");
          console.log(answer);
          socket.emit("msg", {
            type: "answer",
            data: answer,
            from: username,
            to: peerUsername
          });
        });
        break;
      case "answer":
        localConnection.setRemoteDescription(msg.data);
        break;
    }
  }

  $("#clearScreen").click(() => {
    $("#resultTxt").html("");
  });
});
