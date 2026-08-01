import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db, onAuthReady, getCurrentUser } from "./firebase-config.js";

// ---- Room ID handling ----
// Room comes from ?room=xxxx in the URL. If missing, generate one and
// update the URL so the current user can copy/share the link.
function getOrCreateRoomId() {
  const params = new URLSearchParams(window.location.search);
  let roomId = params.get("room");
  if (!roomId) {
    roomId = Math.random().toString(36).slice(2, 8); // short random code
    params.set("room", roomId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }
  return roomId;
}

const roomId = getOrCreateRoomId();

// ---- State ----
let peer = null;           // PeerJS instance
let localStream = null;    // our mic audio
const activeCalls = {};    // uid -> PeerJS MediaConnection
const audioElements = {};  // uid -> <audio> element playing their stream
let unsubscribeParticipants = null;
let micEnabled = true;

// ---- UI hooks (set by app.js / index.html) ----
let onParticipantsChange = () => {};
let onJoinedChange = () => {};

function setParticipantsListener(cb) { onParticipantsChange = cb; }
function setJoinedListener(cb) { onJoinedChange = cb; }

// ---- Core join/leave ----
async function joinCall() {
  const user = getCurrentUser();
  if (!user) {
    console.error("Not signed in yet — can't join call.");
    return;
  }
  const uid = user.uid;

  // 1. Get mic access
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.error("Mic access denied or unavailable:", err);
    alert("Couldn't access your microphone. Check browser permissions.");
    return;
  }

  // 2. Register with PeerJS using our Firebase uid as the peer ID
  //    (uid is already globally unique, so no collisions across rooms/users)
  peer = new Peer(uid, {
    // Using PeerJS's free public cloud signaling server (default) —
    // no config needed for host/port/path.
  });

  peer.on("open", async () => {
    console.log("PeerJS connected with ID:", uid);

    // 3. Announce presence in this room
    const myDocRef = doc(db, "rooms", roomId, "participants", uid);
    await setDoc(myDocRef, {
      uid,
      joinedAt: serverTimestamp()
    });

    onJoinedChange(true);

    // 4. Listen for other participants in the room
    const participantsRef = collection(db, "rooms", roomId, "participants");
    unsubscribeParticipants = onSnapshot(participantsRef, (snapshot) => {
      const currentUids = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        currentUids.push(data.uid);

        // If it's someone new (not us, not already connected) — call them
        if (data.uid !== uid && !activeCalls[data.uid]) {
          callPeer(data.uid);
        }
      });

      // Clean up calls for anyone who left
      Object.keys(activeCalls).forEach((remoteUid) => {
        if (!currentUids.includes(remoteUid)) {
          endCallWith(remoteUid);
        }
      });

      onParticipantsChange(currentUids);
    });
  });

  // 5. Answer incoming calls automatically
  peer.on("call", (incomingCall) => {
    incomingCall.answer(localStream);
    registerCall(incomingCall);
  });

  peer.on("error", (err) => {
    console.error("PeerJS error:", err);
  });
}

function callPeer(remoteUid) {
  if (!peer || !localStream) return;
  const call = peer.call(remoteUid, localStream);
  registerCall(call);
}

function registerCall(call) {
  activeCalls[call.peer] = call;

  call.on("stream", (remoteStream) => {
    // Play the remote participant's audio
    let audioEl = audioElements[call.peer];
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.id = `audio-${call.peer}`;
      document.body.appendChild(audioEl);
      audioElements[call.peer] = audioEl;
    }
    audioEl.srcObject = remoteStream;
  });

  call.on("close", () => endCallWith(call.peer));
  call.on("error", () => endCallWith(call.peer));
}

function endCallWith(remoteUid) {
  if (activeCalls[remoteUid]) {
    activeCalls[remoteUid].close();
    delete activeCalls[remoteUid];
  }
  if (audioElements[remoteUid]) {
    audioElements[remoteUid].remove();
    delete audioElements[remoteUid];
  }
}

async function leaveCall() {
  const user = getCurrentUser();
  if (user) {
    const myDocRef = doc(db, "rooms", roomId, "participants", user.uid);
    await deleteDoc(myDocRef).catch(() => {});
  }

  Object.keys(activeCalls).forEach(endCallWith);

  if (unsubscribeParticipants) {
    unsubscribeParticipants();
    unsubscribeParticipants = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  if (peer) {
    peer.destroy();
    peer = null;
  }

  onJoinedChange(false);
  onParticipantsChange([]);
}

function toggleMute() {
  if (!localStream) return micEnabled;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((track) => { track.enabled = micEnabled; });
  return micEnabled;
}

// Clean up presence doc if the tab closes without clicking "leave"
window.addEventListener("beforeunload", () => {
  const user = getCurrentUser();
  if (user) {
    // Best-effort — may not always complete before unload
    deleteDoc(doc(db, "rooms", roomId, "participants", user.uid)).catch(() => {});
  }
});

export {
  roomId, joinCall, leaveCall, toggleMute,
  setParticipantsListener, setJoinedListener
};