// Called when the user switches between civil/penal
function onModeChange() {
    // Reset client so it will reconnect with the new endpoint
    client = null;
    updateStatus('ready');
    // Optionally, show a message or visual indicator
    addMessage(`Switched to ${selectedMode === 'penal' ? 'Penal' : 'Civil'} mode.`, 'bot');
}
import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client@1.6.0/dist/index.min.js";

let isLoading = false;
let client = null;
let conversationHistory = [];
let recognition = null;
let isListening = false;
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let isSpeaking = false;
// Track selected mode: 'civil' (default) or 'penal'
let selectedMode = 'civil';

// Listen for mode changes
const modeSelect = document.getElementById('modeSelect');
if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
        selectedMode = e.target.value;
        onModeChange();
    });
}

// Initialize Speech Recognition
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'ar-SA'; // Arabic
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('messageInput').value = transcript;
            stopListening();
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopListening();
            if (event.error === 'no-speech') {
                addMessage('لم يتم اكتشاف أي كلام. يرجى المحاولة مرة أخرى.', 'error');
            } else if (event.error === 'not-allowed') {
                addMessage('يرجى السماح بالوصول إلى الميكروفون.', 'error');
            }
        };

        recognition.onend = () => {
            stopListening();
        };
    }
}

function toggleVoiceInput() {
    if (!recognition) {
        addMessage('التعرف على الصوت غير مدعوم في متصفحك.', 'error');
        return;
    }

    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

function startListening() {
    try {
        recognition.start();
        isListening = true;
        const voiceBtn = document.getElementById('voiceBtn');
        voiceBtn.classList.add('listening');
        voiceBtn.disabled = false;
    } catch (error) {
        console.error('Error starting recognition:', error);
    }
}

function stopListening() {
    if (recognition && isListening) {
        recognition.stop();
    }
    isListening = false;
    const voiceBtn = document.getElementById('voiceBtn');
    voiceBtn.classList.remove('listening');
}

// Text-to-Speech Functions using ElevenLabs-style API
// Text-to-Speech Functions with improved fallback
async function speakText(text, messageElement) {
    // Convert text to string if it's not already
    const textToSpeak = String(text || '');

    // Stop any current speech
    if (isSpeaking) {
        stopSpeaking();
        return;
    }

    if (!textToSpeak.trim()) {
        console.error('No text to speak');
        return;
    }

    // Try multiple TTS methods in order of preference
    try {
        isSpeaking = true;
        updateSpeakerIcon(messageElement, true);

        // Method 1: Try ResponsiveVoice API (free tier available)
        if (typeof responsiveVoice !== 'undefined') {
            responsiveVoice.speak(textToSpeak, "Arabic Female", {
                onend: () => {
                    isSpeaking = false;
                    updateSpeakerIcon(messageElement, false);
                },
                onerror: () => {
                    fallbackToWebSpeech(textToSpeak, messageElement);
                }
            });
            return;
        }

        // Method 2: Try VoiceRSS (requires splitting text into chunks)
        const chunks = splitTextIntoChunks(textToSpeak, 100);
        await playChunksSequentially(chunks, messageElement);
        
    } catch (error) {
        console.error('Error with TTS:', error);
        // Final fallback to browser TTS
        fallbackToWebSpeech(textToSpeak, messageElement);
    }
}

// Split text into smaller chunks for better TTS processing
function splitTextIntoChunks(text, maxLength = 100) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxLength) {
            currentChunk += sentence;
        } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    
    return chunks;
}

// Play audio chunks sequentially
async function playChunksSequentially(chunks, messageElement) {
    for (let i = 0; i < chunks.length; i++) {
        if (!isSpeaking) break; // Stop if user cancelled
        
        try {
            // Using VoiceRSS API (free tier)
            const apiKey = 'f8d53cf137ec4c22a1c8c5c4d5b8e6b1'; // Free API key for demo
            const url = `https://api.voicerss.org/?key=${apiKey}&hl=ar-sa&src=${encodeURIComponent(chunks[i])}&c=MP3&f=44khz_16bit_stereo`;
            
            await new Promise((resolve, reject) => {
                const audio = new Audio(url);
                
                audio.onended = resolve;
                audio.onerror = reject;
                
                audio.play().catch(reject);
            });
        } catch (error) {
            console.error(`Error playing chunk ${i}:`, error);
            // On any error, fall back to browser TTS
            fallbackToWebSpeech(chunks.slice(i).join(' '), messageElement);
            return;
        }
    }
    
    isSpeaking = false;
    updateSpeakerIcon(messageElement, false);
}

// Fallback to Web Speech API
function fallbackToWebSpeech(text, messageElement) {
    if (!speechSynthesis) {
        console.error('Text-to-speech not supported');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    const voices = speechSynthesis.getVoices();
    const arabicVoice = voices.find(voice => 
        voice.lang === 'ar-SA' || voice.lang.startsWith('ar')
    );

    if (arabicVoice) {
        utterance.voice = arabicVoice;
    }
    
    utterance.lang = 'ar-SA';
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
        isSpeaking = true;
        updateSpeakerIcon(messageElement, true);
    };

    utterance.onend = () => {
        isSpeaking = false;
        updateSpeakerIcon(messageElement, false);
    };

    utterance.onerror = () => {
        isSpeaking = false;
        updateSpeakerIcon(messageElement, false);
    };

    speechSynthesis.speak(utterance);
}

function updateSpeakerIcon(messageElement, speaking) {
    const speakerBtn = messageElement.querySelector('.speaker-btn');
    if (speakerBtn) {
        if (speaking) {
            speakerBtn.classList.add('speaking');
        } else {
            speakerBtn.classList.remove('speaking');
        }
    }
}

function stopSpeaking() {
    isSpeaking = false;
    
    // Stop ResponsiveVoice if it's being used
    if (typeof responsiveVoice !== 'undefined' && responsiveVoice.isPlaying()) {
        responsiveVoice.cancel();
    }
    
    // Stop any playing audio elements
    const audios = document.getElementsByTagName('audio');
    for (let audio of audios) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = ''; // Clear the source to fully stop
    }
    
    // Stop speech synthesis if active
    if (speechSynthesis && speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    
    // Update all speaker icons to not-speaking state
    const allSpeakerBtns = document.querySelectorAll('.speaker-btn');
    allSpeakerBtns.forEach(btn => btn.classList.remove('speaking'));
}

// Load conversation from localStorage on startup
function loadConversation() {
    try {
        const saved = localStorage.getItem('chatHistory');
        if (saved) {
            conversationHistory = JSON.parse(saved);
            displayConversation();
        }
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}

// Save conversation to localStorage
function saveConversation() {
    try {
        localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
    } catch (error) {
        console.error('Error saving conversation:', error);
    }
}

// Display saved conversation
function displayConversation() {
    const messagesDiv = document.getElementById('chatMessages');
    const emptyState = messagesDiv.querySelector('.empty-state');
    if (emptyState && conversationHistory.length > 0) {
        emptyState.remove();
    }

    conversationHistory.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.type}`;
        
        // Add speaker button for bot messages
        if (msg.type === 'bot') {
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            messageContent.textContent = msg.text;
            
        const speakerBtn = document.createElement('button');
        speakerBtn.className = 'speaker-btn';
        speakerBtn.title = 'Read aloud';
        speakerBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        speakerBtn.onclick = function() {
            speakText(msg.text, messageDiv);
        };
        
        const stopBtn = document.createElement('button');
        stopBtn.className = 'stop-btn';
        stopBtn.title = 'Stop speaking';
        stopBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12"></rect>
            </svg>
        `;
        stopBtn.onclick = function() {
            stopSpeaking();
            updateSpeakerIcon(messageDiv, false);
        };
        
        messageContent.appendChild(speakerBtn);
        messageContent.appendChild(stopBtn);
            messageDiv.appendChild(messageContent);
        } else {
            messageDiv.innerHTML = `<div class="message-content">${escapeHtml(msg.text)}</div>`;
        }
        
        messagesDiv.appendChild(messageDiv);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Start a new chat
function startNewChat() {
    if (confirm('Start a new chat? Current conversation will be saved.')) {
        conversationHistory = [];
        saveConversation();
        const messagesDiv = document.getElementById('chatMessages');
        messagesDiv.innerHTML = `
            <div class="empty-state">
                <h2>⚖️</h2>
                <p>Welcome to Legal AI Assistant</p>
                <p style="font-size: 12px; margin-top: 10px;">Your conversations are securely saved.</p>
            </div>
        `;
    }
}

// Initialize Gradio client
async function initializeClient() {
    try {
        if (!client) {
            updateStatus('connecting');
            let endpoint = "ramdane/sanhouri";
            if (selectedMode === 'penal') {
                endpoint = "ramdane/penalsanhouri";
            }
            client = await Client.connect(endpoint);
            updateStatus('ready');
            console.log('Gradio client connected successfully to', endpoint);
        }
        return client;
    } catch (error) {
        console.error('Failed to initialize client:', error);
        updateStatus('error');
        throw error;
    }
}

function updateStatus(status) {
    const badge = document.getElementById('statusBadge');
    badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    badge.style.background = status === 'ready' ? 'rgba(76, 175, 80, 0.3)' :
                            status === 'error' ? 'rgba(244, 67, 54, 0.3)' :
                            'rgba(255, 193, 7, 0.3)';
}

function addMessage(text, type = 'bot') {
    const messagesDiv = document.getElementById('chatMessages');
    
    // Remove empty state if exists
    const emptyState = messagesDiv.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    // Add speaker button for bot messages
    if (type === 'bot') {
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = text;
        
        const speakerBtn = document.createElement('button');
        speakerBtn.className = 'speaker-btn';
        speakerBtn.title = 'Read aloud';
        speakerBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        speakerBtn.onclick = function() {
            speakText(text, messageDiv);
        };
        
        const stopBtn = document.createElement('button');
        stopBtn.className = 'stop-btn';
        stopBtn.title = 'Stop speaking';
        stopBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12"></rect>
            </svg>
        `;
        stopBtn.onclick = function() {
            stopSpeaking();
            updateSpeakerIcon(messageDiv, false);
        };
        
        messageContent.appendChild(speakerBtn);
        messageContent.appendChild(stopBtn);
        messageDiv.appendChild(messageContent);
    } else {
        messageDiv.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Save to conversation history (exclude error messages)
    if (type !== 'error') {
        conversationHistory.push({ text, type });
        saveConversation();
    }
}

function showLoading() {
    const messagesDiv = document.getElementById('chatMessages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot';
    loadingDiv.id = 'loadingIndicator';
    loadingDiv.innerHTML = `
        <div class="loading">
            <div class="loading-dots">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
        </div>
    `;
    messagesDiv.appendChild(loadingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideLoading() {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.remove();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const message = input.value.trim();

    if (!message || isLoading) return;

    isLoading = true;
    sendBtn.disabled = true;
    input.value = '';

    addMessage(message, 'user');
    showLoading();

    try {
        // Ensure client is initialized
        const gradioClient = await initializeClient();
        
        updateStatus('processing');

        // Call the /chat endpoint with the message
        const result = await gradioClient.predict("/chat", { 		
            message: message
        });

        hideLoading();
        
        // Extract response from result
        if (result && result.data) {
            const response = result.data;
            addMessage(response, 'bot');
        } else {
            addMessage('No response received from the API.', 'error');
        }

        updateStatus('ready');

    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        addMessage(`Error: ${error.message}. Please check the API connection.`, 'error');
        updateStatus('error');
        
        // Reset client on error
        client = null;
        setTimeout(() => updateStatus('ready'), 3000);
    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

async function testConnection() {
    updateStatus('testing');
    try {
        const gradioClient = await initializeClient();
        const result = await gradioClient.predict("/chat", { 		
            message: "Hello"
        });
        
        if (result && result.data) {
            addMessage(`✅ Connection test successful! Response: ${result.data}`, 'bot');
            updateStatus('ready');
        } else {
            addMessage('⚠️ Connection test completed but no data received', 'error');
            updateStatus('error');
        }
    } catch (error) {
        addMessage(`❌ Connection test failed: ${error.message}`, 'error');
        updateStatus('error');
        client = null;
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Make functions available globally
window.sendMessage = sendMessage;
window.testConnection = testConnection;
window.handleKeyPress = handleKeyPress;
window.startNewChat = startNewChat;
window.toggleVoiceInput = toggleVoiceInput;
window.speakText = speakText;
window.stopSpeaking = stopSpeaking;

// Initialize speech recognition
initSpeechRecognition();

// Load voices for text-to-speech
let voicesLoaded = false;

function loadVoices() {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0 && !voicesLoaded) {
        voicesLoaded = true;
        console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
        
        // Log Arabic voices specifically
        const arabicVoices = voices.filter(v => v.lang.includes('ar'));
        console.log('Arabic voices found:', arabicVoices.length);
        arabicVoices.forEach(v => console.log(`- ${v.name} (${v.lang})`));
    }
}

// Try to load voices immediately
loadVoices();

// Also listen for the voiceschanged event
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// Force load after a delay as backup
setTimeout(loadVoices, 1000);

// Load saved conversation on startup
loadConversation();

// Initialize client on load
initializeClient().catch(err => {
    console.error('Initial connection failed:', err);
    addMessage('⚠️ Failed to connect to API. Click "Test API" to retry.', 'error');
});

// Focus input on load
document.getElementById('messageInput').focus();
