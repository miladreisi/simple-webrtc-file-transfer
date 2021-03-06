let localConnection = null
let sendDataChannel = null
let receiveDataChannel = null
let socket = null
let socketConnected = false
let sendDataChannelOpen = false
const localVideoEl = document.getElementById('localVideo')
const remoteVideoEl = document.getElementById('remoteVideo')
const mediaConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true
    },
    video: true
}
jQuery(document).ready(($) => {
    $('#connectToServerBtn').click(() => {
        socket = io('https://192.168.2.4:3000', {
            rejectUnauthorized: false
        })
        socket.on('connect', () => {
            socketConnected = true
            console.log('connected')
        })

        socket.on('disconnect', () => {
            socketConnected = false
            console.log('disconnected')
        })

        socket.on('msg', (msg) => {
            handleSignalingMsg(msg)
        })
    })

    $('#startBtn').click(function () {
        initLocalConnection()
        initMedia().then(() => {
            localConnection.createOffer().then((offer) => {

                localConnection.setLocalDescription(offer)
                console.log('sending offer')
                console.log(offer)
                socket.emit('msg', {
                    type: 'offer',
                    data: offer
                })
            })
        })

    })

    $('#inputTxt').keyup((e) => {
        if (e.which == 13) {
            sendMsg()
        }
    })

    $('#sendBtn').click(() => {
        sendMsg()
    })

    function sendMsg() {
        let txt = $('#inputTxt').val()
        sendDataChannel.send(txt)
        $('#chatTxt').append('<span>Me: </span>' + txt + '<br/>')
        $('#inputTxt').val('').focus()
    }

    function receiveDatachannelCreatedCallback(event) {
        console.log('receiveDatachannelCreatedCallback')
        receiveDataChannel = event.channel
        receiveDataChannel.onmessage = receiveDataChannelOnMsgCallback
        receiveDataChannel.onopen = receiveDataChannelOnOpenCallback
        receiveDataChannel.onclose = receiveDataChannelOncloseCallback
    }

    function receiveDataChannelOnMsgCallback(event) {
        $('#chatTxt').append(event.data + '<br/>')
    }

    function receiveDataChannelOnOpenCallback() {
        console.log('receiveDataChannelOnOpenCallback')
    }

    function receiveDataChannelOncloseCallback() {
        console.log('receiveDataChannelOncloseCallback')
    }

    function sendDataChannelOpenCallback(event) {
        console.log('sendDataChannel open event')
        sendDataChannelOpen = true
    }

    function sendDataChannelCloseCallback(event) {
        console.log('sendDataChannel close event')
        sendDataChannelOpen = false
    }

    function initLocalConnection() {
        if (localConnection != null) {
            return
        }

        localConnection = new RTCPeerConnection({
            'iceServers': [{
                urls: "stun:stun.l.google.com:19302"
            }]
        })

        localConnection.ondatachannel = receiveDatachannelCreatedCallback
        sendDataChannel = localConnection.createDataChannel('myDataChannel')
        sendDataChannel.onopen = sendDataChannelOpenCallback
        sendDataChannel.onclose = sendDataChannelCloseCallback

        localConnection.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('msg', {
                    type: 'candidate',
                    data: e.candidate
                })
            }
        }

        localConnection.ontrack = (event) => {
            console.log('ontrack1')
            if (remoteVideoEl.srcObject) return
            console.log('ontrack2')
            remoteVideoEl.srcObject = event.streams[0]
            remoteVideoEl.play()
        }
    }

    function initMedia() {
        return new Promise((resolve, reject) => {
            if (!localConnection) {
                return resolve()
            }
            navigator.getUserMedia(mediaConstraints, (stream) => {
                stream.getTracks().forEach((track) =>
                    localConnection.addTrack(track, stream))

                localVideoEl.srcObject = stream
                localVideoEl.volume = 0
                localVideoEl.play()
                return resolve()
            }, (err) => {
                console.error(err)
                return reject(err)
            })
        })
    }

    function handleSignalingMsg(msg) {
        console.log('msg from signaling')
        console.log(msg)

        switch (msg.type) {
            case 'candidate':
                if (localConnection == null) {
                    initLocalConnection()
                }
                localConnection.addIceCandidate(msg.data)
                break;
            case 'offer':
                if (localConnection == null) {
                    initLocalConnection()
                }
                localConnection.setRemoteDescription(msg.data)
                initMedia().then(() => {
                    localConnection.createAnswer().then((answer) => {
                        localConnection.setLocalDescription(answer)
                        console.log('sending answer')
                        console.log(answer)
                        socket.emit('msg', {
                            type: 'answer',
                            data: answer
                        })
                    })
                })
                break
            case 'answer':
                localConnection.setRemoteDescription(msg.data)
                break
        }
    }
})