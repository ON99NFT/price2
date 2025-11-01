// Global audio control
const globalAudioBtn = document.getElementById('global-audio-btn');
let globalAudioEnabled = false;
let audioContext = null;

// Expose audio context to other scripts
window.GlobalAudio = {
    audioContext: null,
    enabled: false
};

globalAudioBtn.addEventListener('click', async () => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      window.GlobalAudio.audioContext = audioContext;
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    globalAudioEnabled = true;
    window.GlobalAudio.enabled = true;
    globalAudioBtn.innerHTML = '<span class="audio-icon">🔊</span> Sounds Enabled!';
    globalAudioBtn.classList.add('audio-enabled');
    
    // Enable audio for all tokens
    if (typeof WLFI !== 'undefined' && WLFI.enableAudio) WLFI.enableAudio();
    if (typeof XPL !== 'undefined' && XPL.enableAudio) XPL.enableAudio();
    if (typeof LINEA !== 'undefined' && LINEA.enableAudio) LINEA.enableAudio();
    if (typeof LINEAKyber !== 'undefined' && LINEAKyber.enableAudio) LINEAKyber.enableAudio();
  } catch (error) {
    console.error('Audio initialization failed:', error);
    globalAudioBtn.innerHTML = '<span class="audio-icon">❌</span> Error';
    globalAudioBtn.style.background = '#c62828';
  }
});

// Play alert sound with custom frequency
async function playSystemAlert(volume = 0.2, frequency = 784) {
  if (!globalAudioEnabled || !audioContext) return;
  
  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    console.error('Sound playback failed:', error);
  }
}

// Make function available to other scripts
window.playSystemAlert = playSystemAlert;
