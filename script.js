// Firebase設定
const firebaseConfig = {
    apiKey: "AIzaSyAKMZsgI--vaDuqnQTviydmD_DZbsRiYP0",
    authDomain: "schedule-f15f9.firebaseapp.com",
    projectId: "schedule-f15f9",
    storageBucket: "schedule-f15f9.firebasestorage.app",
    messagingSenderId: "1060387003782",
    appId: "1:1060387003782:web:8cef107a040628adcd6007"
};

let db;
let auth;
let userId = null;
let isAuthReady = false;

// UI要素
const eventForm = document.getElementById('event-form');
const eventList = document.getElementById('event-list');
const loadingMessage = document.getElementById('loading-message');
const userIdDisplay = document.getElementById('user-id-display');
const submitButton = document.getElementById('submit-button');
const submitText = document.getElementById('submit-text');
const submitSpinner = document.getElementById('submit-spinner');

const SCHEDULES_PATH = `schedules`; 

// モーダル制御
function openModal(title, message, isConfirm = false, onConfirm = null) {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const buttonContainer = modal.querySelector('.modal-buttons');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    buttonContainer.innerHTML = '';

    if (isConfirm) {
        let cancelButton = document.createElement('button');
        cancelButton.textContent = 'キャンセル';
        cancelButton.className = 'py-2 px-4 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition focus:outline-none';
        cancelButton.onclick = () => { closeModal(); onConfirm(false); };
        
        let confirmButton = document.createElement('button');
        confirmButton.textContent = title === '削除の確認' ? '削除' : 'OK';
        confirmButton.className = `py-2 px-4 rounded-lg ${title === '削除の確認' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white transition focus:outline-none shadow-md`;
        confirmButton.onclick = async () => { closeModal(); onConfirm(true); };

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(confirmButton);
    } else {
        let closeButton = document.createElement('button');
        closeButton.textContent = '閉じる';
        closeButton.className = 'w-full py-2 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition focus:outline-none shadow';
        closeButton.onclick = () => closeModal();
        buttonContainer.appendChild(closeButton);
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeModal = function() {
    document.getElementById('custom-modal').classList.add('hidden');
    document.getElementById('custom-modal').classList.remove('flex');
}

// Firebase初期化
async function initializeFirebase() {
    try {
        const app = firebase.initializeApp(firebaseConfig); 
        db = firebase.firestore(app); 
        auth = firebase.auth(app); 

        firebase.auth().onAuthStateChanged(async (user) => { 
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = `オンライン: ${userId}`;
                submitButton.disabled = false;
                isAuthReady = true;
                setupRealtimeListener();
            } else {
                userId = null;
                userIdDisplay.textContent = "認証中";
                submitButton.disabled = true;
                try {
                    await firebase.auth().signInAnonymously();
                } catch (e) {
                    console.error("認証エラー:", e);
                    openModal("認証エラー", "認証失敗", false);
                    userIdDisplay.textContent = "認証失敗。";
                }
            }
        });
    } catch (error) {
        console.error("Firebase初期化エラー:", error);
        openModal("初期化エラー", "Firebaseのセットアップ中に問題が発生しました。", false);
    }
}

// 予定追加
eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userId || !db) return;

    submitButton.disabled = true;
    submitText.classList.add('hidden');
    submitSpinner.classList.remove('hidden');

    const eventName = document.getElementById('eventName').value.trim();
    const eventDate = document.getElementById('eventDate').value;
    const eventTime = document.getElementById('eventTime').value;

    if (!eventName || !eventDate) {
        openModal("入力エラー", "タイトルと日付を入力してください", false);
        submitButton.disabled = false;
        submitText.classList.remove('hidden');
        submitSpinner.classList.add('hidden');
        return;
    }

    try {
        const dateParts = eventDate.split('-'); 
        const timeParts = eventTime ? eventTime.split(':') : ['00', '00']; 

        const fullDateTime = new Date(
            dateParts[0], dateParts[1] - 1, dateParts[2], 
            timeParts[0], timeParts[1]
        );

        const newEvent = {
            name: eventName,
            dateTime: fullDateTime.toISOString(), 
            creatorId: userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection(SCHEDULES_PATH).add(newEvent);
        eventForm.reset();

    } catch (error) {
        console.error("予定の追加エラー:", error);
        openModal("保存エラー", "予定の保存中に問題が発生しました。", false);
    } finally {
        submitButton.disabled = false;
        submitText.classList.remove('hidden');
        submitSpinner.classList.add('hidden');
    }
});

// 予定削除
window.deleteEvent = async function(eventId, eventCreatorId) {
    if (!userId || !db) return;
    if (userId !== eventCreatorId) {
        openModal("アクセス拒否", "作成者のみ削除可能", false);
        return;
    }
    
    // Promiseを使って確認ダイアログの結果を待つ
    const confirmed = await new Promise(resolve => {
        openModal("削除の確認", "本当に削除しますか？", true, resolve);
    });
    
    if (confirmed) {
        try {
            await db.collection(SCHEDULES_PATH).doc(eventId).delete();
        } catch (error) {
            console.error("予定の削除エラー:", error);
            openModal("削除エラー", "問題発生", false);
        }
    }
}

// リアルタイムリスナー
function setupRealtimeListener() {
    if (!db || !isAuthReady) return;

    const q = db.collection(SCHEDULES_PATH);

    q.onSnapshot((querySnapshot) => {
        const events = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            events.push({ id: doc.id, ...data });
        });

        events.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
        renderEvents(events);
    }, (error) => {
        console.error("Firestoreリアルタイムエラー:", error);
        openModal("同期エラー", "予定のリアルタイム同期中に問題が発生しました。", false);
        loadingMessage.textContent = "同期エラーが発生しました。";
    });
}

// 描画
function renderEvents(events) {
    loadingMessage.classList.add('hidden');
    eventList.innerHTML = '';

    if (events.length === 0) {
        eventList.innerHTML = '<p class="text-gray-500 p-4 bg-gray-50 rounded-lg text-center">共有予定なし</p>';
        return;
    }

    events.forEach(event => {
        const date = new Date(event.dateTime);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isPast = date < now;

        const formattedDate = date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
        const timeOnly = date.getHours() !== 0 || date.getMinutes() !== 0;
        const formattedTime = timeOnly ? date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }).replace(/^24:/, '00:') : '終日';

        const isCreator = event.creatorId === userId;
        const baseClass = isPast ? 'opacity-70 border-gray-300 bg-gray-50' : 'border-indigo-600 bg-white';
        
        const eventItem = document.createElement('div');
        eventItem.className = `event-card p-4 rounded-lg shadow-md flex justify-between items-start ${baseClass}`;
        eventItem.style.borderLeftColor = isPast ? '#9ca3af' : '#4f46e5';
        
        let eventContent = `
            <div class="flex-1">
                <div class="flex items-center mb-1 flex-wrap gap-2">
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full 
                        ${isPast ? 'bg-gray-400 text-white' : isToday ? 'bg-red-500 text-white' : 'bg-indigo-100 text-indigo-800'}">
                        ${formattedDate}
                        ${isPast ? ' (終了)' : isToday ? ' (今日)' : ''}
                    </span>
                    <span class="text-sm font-semibold ${timeOnly ? 'text-gray-700' : 'text-gray-400'}">${formattedTime}</span>
                </div>
                <h3 class="text-lg font-bold text-gray-900 break-all">${event.name}</h3>
                <p class="text-xs text-gray-500 mt-1 truncate" title="${event.creatorId}">
                    作成者: ${event.creatorId ? event.creatorId.substring(0, 8) + '...' : '不明'}
                    ${isCreator ? '<span class="ml-1 text-indigo-600 font-bold">(あなた)</span>' : ''}
                </p>
            </div>
        `;

        eventItem.innerHTML = eventContent;

        if (isCreator) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'ml-2 p-2 rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 transition duration-150 flex-shrink-0';
            deleteBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            `;
            deleteBtn.onclick = () => deleteEvent(event.id, event.creatorId);
            eventItem.appendChild(deleteBtn);
        }

        eventList.appendChild(eventItem);
    });
}

// 実行
initializeFirebase();

