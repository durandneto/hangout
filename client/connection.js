function MultiStream(wssSocketUrl) {
  this.wssSocketUrl = wssSocketUrl
  this.uuid
  this.localStream
  this.amIHost = false
  this.loaddedFaceApi = false
  this.hostId
  this.container
  this.logContainer
  this.localVideo
  this.serverConnection
  this.availableSlots = 2
  this.remotePeerConnection = {}
  this.onlineUsers = []
  this.offerPeerConnection = []
  this.constraints = {
    video: true,
    audio: true,
  }
  this.peerConnectionConfig = {
    'iceServers': [
      {'urls': 'stun:stun.stunprotocol.org:3478'},
      {'urls': 'stun:stun.l.google.com:19302'},
    ]
  }

  const setAvailableSlots = n => {
    this.availableSlots = n
  }

  const init = () => {
    this.serverConnection = new WebSocket(this.wssSocketUrl)
    this.serverConnection.onmessage = gotMessageFromServer
    this.uuid = createUUID()
    createContainer()
  }

  const errorHandler = error => {
    print('errorHandler' + error);
  }

  const s4 = () => {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }

  const createUUID = () => {
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

  const peerToPeerNetworkMap = () => {
    print('peerToPeerNetworkMap')
    const clientClone = this.onlineUsers.map(x=>x)
    clientClone.push(this.uuid)
    this.onlineUsers.map(c => {
      let cl = clientClone.shift()
      clientClone.map(clone => {
        this.offerPeerConnection.push([cl, clone])
      })
    })
// print('this.offerPeerConnection', this.offerPeerConnection)
    this.offerPeerConnection.map(offer => {
      print('send create offer reuqest ' + ' offer ' + offer[0] + ' answer ' + offer[1])
      this.serverConnection.send(JSON.stringify({'action': 'create-offer', 'offer': offer[0] , 'answer': offer[1]  ,'uuid': this.uuid}));
    })
  }

  const printExpression = data => {
    // print('Expression received' +  data.property)
    let container = document.getElementById(`${data.uuid}-${data.to}-container`)
    let img = document.getElementById(`${data.uuid}-${data.to}-expression`)
    switch(true) {
      case data.property === 'happy':
        // container.style.backgroundColor = "green";
        img.src = 'https://jewel1067.com/wp-content/uploads/smile.jpg'
        break
        case data.property === 'sad':
          // container.style.backgroundColor = "gray";
          img.src = 'https://cdn.shopify.com/s/files/1/1061/1924/products/Angry_Emoji_large.png'
        break
        case data.property === 'angry':
          // container.style.backgroundColor = "black";
          img.src = 'https://cdn.shopify.com/s/files/1/1061/1924/products/Angry_Emoji_large.png'
        break
      case data.property === 'surprised':
        // container.style.backgroundColor = "yellow";
        img.src = 'https://i0.wp.com/www.totaltrendy.com/wp-content/uploads/2017/07/OMG_Emoji_Icon_0cda9b05-20a8-47f0-b80f-df5c982e0963_large.png'
        break
      default:
        // container.style.backgroundColor = "blue";
        img.src = ''
    }
  }

  const gotMessageFromServer = message => {
    const data = JSON.parse(message.data);

    if (data.action === 'create-offer' && this.uuid === data.offer) {
      print('create offer to ' + data.answer)
      createOffer(data)
    }

    if (data.to === this.uuid) {
      if(data.sdp) {
        print('setRemoteDescription ' + data.sdp.type)
        if (!this.remotePeerConnection[data.idConn]) {
          print('create remote connection ' + data.idConn)
        }
        if (!this.remotePeerConnection[data.idConn]) joinOnResponse(data.idConn)
        this.remotePeerConnection[data.idConn].setRemoteDescription(new RTCSessionDescription(data.sdp)).then(() => {
          print('create remote connection offer => ' + data.offer + " answer => " + data.answer)
          if(data.sdp.type == 'offer') {
              this.remotePeerConnection[data.idConn].createAnswer().then(description => {
                print('create remote answer offer => ' + data.offer + " answer => " + data.answer + " conn " + data.idConn)
                this.remotePeerConnection[data.idConn].setLocalDescription(description).then(() => {
                  print('setLocalDescription offer => ' + data.offer + " answer => " + data.answer + " conn " + data.idConn)
                  this.serverConnection.send(JSON.stringify({to: data.offer, idConn: data.idConn, 'offer': data.offer, 'answer': data.answer ,'sdp': this.remotePeerConnection[data.idConn].localDescription, 'uuid': this.uuid}));
                }).catch(errorHandler);
              }).catch(errorHandler);
            }
          }).catch(errorHandler);
        }
        if(data.ice) {
          this.remotePeerConnection[data.idConn].addIceCandidate(new RTCIceCandidate(data.ice)).catch(errorHandler);
        }

        if (data.action === 'send-expression') {
          printExpression(data)
        }
      } else {
        if (data.uuid !== this.uuid) {
          switch(true) {
            case data.action === 'get-uuid':
              print('get-uuid request received')
              Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
                faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
                faceapi.nets.faceExpressionNet.loadFromUri('/models')
              ]).then(() => {
                getLocalStream(() => {
                  print('set-uuid request to asker')
                  this.serverConnection.send(JSON.stringify({'action': 'send-uuid', 'uuid': this.uuid}));
                })
              })
              break
            case data.action === 'send-uuid':
              this.onlineUsers.push(data.uuid)
              print('send-uuid request received', )
              console.log(this.onlineUsers)
              if (this.onlineUsers.length === this.availableSlots) {
                peerToPeerNetworkMap()
              }
            break
            case data.action === 'set-host-id':
              console.log('set host id', data.uuid)
              this.hostId = data.uuid
            break
          }
        }
      }
  }

  const createRemoteVideo = (stream, idConn) => {
    print('createRemoteVideo', stream);
    const container = document.createElement('div')
    container.id = `${idConn}-container`
    var remoteExpression = document.createElement('img')
    remoteExpression.id = `${idConn}-expression`
    remoteExpression.className = `img-expression`

    var remoteVideo = document.createElement('video')
    remoteVideo.srcObject = stream;
    remoteVideo.autoplay = true;
    remoteVideo.id = `${idConn}-video`;
    remoteVideo.style = "width:40%;";
    container.appendChild(remoteVideo)
    container.appendChild(remoteExpression)
    this.container.appendChild(container)
  }

  const print = (text, object) => {
    this.logContainer.innerHTML += text + "<br><br>"
    console.log(text, object)
  }

  const createContainer = () => {
    this.container = document.createElement('div')
    this.logContainer = document.createElement('div')
    this.container.innerHTML = this.uuid
    document.body.appendChild(this.container)
    document.body.appendChild(this.logContainer)
  }

  const getUserMedia = (stream, cb) => {
    if (cb) {
      print('getUserMedia with callback')
    } else {
      print('getUserMedia without callback')
    }
    // localStream = stream;
    this.localStream = stream;
    this.localVideo = document.createElement('video')
    this.localVideo.autoplay = true;
    this.localVideo.muted = true;
    this.localVideo.style = "width:50%;";
    this.localVideo.srcObject = stream;
    if (!this.amIHost) {
      this.localVideo.addEventListener('play', () => {
        setInterval(async () => {
          const detections = await faceapi.detectAllFaces(this.localVideo, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions()
          for (const property in detections[0].expressions) {
            if (Math.round(detections[0].expressions[property] * 100) / 100 > 0.90)  {
              this.serverConnection.send(JSON.stringify({'action': 'send-expression', property, 'to': this.hostId,  'uuid': this.uuid}));
            }
          }
        }, 100)
      })
    }
    this.container.appendChild(this.localVideo)
    if ( cb ) {
      print('getUserMedia calling callback')
      cb()
    }
  }

  const start = () => {
    print('start')
    this.amIHost = true
    this.loaddedFaceApi = true
    this.serverConnection.send(JSON.stringify({'action': 'set-host-id', 'uuid': this.uuid}));
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      faceapi.nets.faceExpressionNet.loadFromUri('/models')
    ]).then(() => {
      print('face api loadded')
      getLocalStream(() =>{
        print('getLocalStream callback')
        getConnections()
      })
    })
    // sendConnection()
  }

  const createOffer = data => {
    joinOnResponse(`${data.offer}-${data.answer}`)
    this.remotePeerConnection[`${data.offer}-${data.answer}`].createOffer().then(offer => {
      print('createOffer ' + `${data.offer}-${data.answer}`)
      this.remotePeerConnection[`${data.offer}-${data.answer}`].setLocalDescription(offer).then(()=> {
        this.serverConnection.send(JSON.stringify({
          idConn: `${data.offer}-${data.answer}`,
          'offer': data.offer,
          'answer': data.answer ,
          'to': data.answer,
          'sdp': this.remotePeerConnection[`${data.offer}-${data.answer}`].localDescription,
          'uuid': this.uuid}));
      }).catch(errorHandler);
    }).catch(errorHandler);
  }

  const sendConnection = () => {
    this.serverConnection.send(JSON.stringify({'action': 'send-uuid', 'uuid': this.uuid}));
  }

  const getConnections = () => {
    print('getConnections')
    this.serverConnection.send(JSON.stringify({'action': 'get-uuid', 'uuid': this.uuid}));
  }

  const joinOnResponse = idConn => {
    print(`joinOnResponse ${idConn}`)
    this.remotePeerConnection[idConn] = new RTCPeerConnection(this.peerConnectionConfig);
    this.remotePeerConnection[idConn].onicecandidate = event =>  {
      if(event.candidate != null) {
        print(`onicecandidate ${idConn}`)
        this.serverConnection.send(JSON.stringify({idConn ,'ice': event.candidate, 'uuid': this.uuid}));
      }
    }

    this.remotePeerConnection[idConn].ontrack = event => {
      print('ontrack =>',event);
      if (event.track.kind === 'video') {
        createRemoteVideo(event.streams[0], idConn)
      }
    }
    print(`addStream ${idConn}`)
    this.remotePeerConnection[idConn].addStream(this.localStream);
  }

  const getLocalStream = cb => {
    if(cb) {
      print('getLocalStream with callback')
    } else {
      print('getLocalStream without callback')
    }

    if(navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia(this.constraints).then(stream => {
        print('getLocalStream streaming okay')
        getUserMedia(stream, cb)
      }).catch(errorHandler);
    } else {
      alert('Your browser does not support getUserMedia API');
    }
  }


  init()

  return {
    getLocalStream,
    start,
    joinOnResponse,
    sendConnection,
    getConnections,
    setAvailableSlots,
    peerToPeerNetworkMap
  }

}
