const audio = document.getElementById("audio");
const songListEl = document.getElementById("song-list");
const emptyHintEl = document.getElementById("empty-hint");
const lyricsViewport = document.getElementById("lyrics-viewport");
const currentTitleEl = document.getElementById("current-title");
const timeCurrentEl = document.getElementById("time-current");
const timeTotalEl = document.getElementById("time-total");
const progressEl = document.getElementById("progress");
const btnPlay = document.getElementById("btn-play");
const btnRestart = document.getElementById("btn-restart");
const btnMic = document.getElementById("btn-mic");
const btnRefresh = document.getElementById("btn-refresh");
const micStatusEl = document.getElementById("mic-status");

let songs = [];
let currentSong = null;
let lyrics = [];
let activeLineIndex = -1;
let activeWordIndex = -1;
let rafId = null;
let micEnabled = false;
let micStream = null;
let audioContext = null;
let micSource = null;
let micGain = null;
let lyricsScrollEl = null;

function toSeconds(min, sec, fracRaw) {
  const frac = fracRaw ? Number(fracRaw.padEnd(3, "0")) / 1000 : 0;
  return Number(min) * 60 + Number(sec) + frac;
}

function parseLengthTag(text) {
  const match = text.match(/^\[length:\s*(\d+):(\d{1,2})\s*\]/m);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function interpolateWords(text, startTime, endTime) {
  if (!text) return [{ text: "···", time: startTime }];

  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [{ text: "···", time: startTime }];

  const duration = Math.max(endTime - startTime, 0.2);
  const weights = tokens.map((token) =>
    Math.max(token.replace(/[^a-zA-ZÀ-ÿ]/g, "").length, 1)
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;

  return tokens.map((token, index) => {
    const word = { text: token, time: startTime + elapsed };
    elapsed += duration * (weights[index] / total);
    return word;
  });
}

function parseWordsFromLine(content, lineTime, endTime) {
  const enhancedMatches = [
    ...content.matchAll(/<(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?>/g),
  ];

  if (enhancedMatches.length > 0) {
    const words = [];
    for (let i = 0; i < enhancedMatches.length; i++) {
      const match = enhancedMatches[i];
      const start = match.index + match[0].length;
      const end =
        i + 1 < enhancedMatches.length
          ? enhancedMatches[i + 1].index
          : content.length;
      const text = content.slice(start, end).trim();
      if (text) {
        words.push({
          text,
          time: toSeconds(match[1], match[2], match[3]),
        });
      }
    }
    return words;
  }

  return interpolateWords(content, lineTime, endTime);
}

function parseLrc(text) {
  const lineRe = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/;
  const raw = [];

  for (const row of text.split(/\r?\n/)) {
    const trimmed = row.trim();
    if (!trimmed) continue;

    const match = trimmed.match(lineRe);
    if (!match) continue;

    raw.push({
      time: toSeconds(match[1], match[2], match[3]),
      content: match[4].trim(),
    });
  }

  raw.sort((a, b) => a.time - b.time);

  const songEnd =
    parseLengthTag(text) ||
    (raw.length ? raw[raw.length - 1].time + 5 : 300);

  return raw.map((line, index) => {
    let endTime = songEnd;
    for (let j = index + 1; j < raw.length; j++) {
      if (raw[j].content) {
        endTime = raw[j].time;
        break;
      }
    }

    const plainText = line.content
      .replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const words = parseWordsFromLine(line.content, line.time, endTime);

    return {
      time: line.time,
      endTime,
      text: plainText || words.map((word) => word.text).join(" "),
      words,
    };
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setControlsEnabled(enabled) {
  btnPlay.disabled = !enabled;
  btnRestart.disabled = !enabled;
  btnMic.disabled = !enabled;
  progressEl.disabled = !enabled;
}

function renderSongList() {
  songListEl.innerHTML = "";

  if (songs.length === 0) {
    emptyHintEl.classList.remove("hidden");
    return;
  }

  emptyHintEl.classList.add("hidden");

  for (const song of songs) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "song-item";
    btn.textContent = song.title;
    btn.dataset.id = song.id;
    if (currentSong?.id === song.id) btn.classList.add("active");
    btn.addEventListener("click", () => selectSong(song));
    li.appendChild(btn);
    songListEl.appendChild(li);
  }
}

function renderLineWords(lineEl, words) {
  lineEl.replaceChildren();

  words.forEach((word, index) => {
    const span = document.createElement("span");
    span.className = "lyric-word upcoming";
    span.dataset.wordIndex = String(index);
    span.textContent = word.text;
    lineEl.appendChild(span);

    if (index < words.length - 1) {
      lineEl.appendChild(document.createTextNode(" "));
    }
  });
}

function renderLyrics() {
  lyricsViewport.innerHTML = "";
  lyricsScrollEl = null;

  if (!lyrics.length) {
    const p = document.createElement("p");
    p.className = "lyrics-placeholder";
    p.textContent = "Sem letras neste arquivo LRC";
    lyricsViewport.appendChild(p);
    return;
  }

  const scroll = document.createElement("div");
  scroll.className = "lyrics-scroll";
  scroll.id = "lyrics-scroll";

  for (let i = 0; i < lyrics.length; i++) {
    const line = document.createElement("p");
    line.className = "lyric-line upcoming";
    line.dataset.index = String(i);
    renderLineWords(line, lyrics[i].words);
    scroll.appendChild(line);
  }

  lyricsViewport.appendChild(scroll);
  lyricsScrollEl = scroll;
}

function findActiveLineIndex(time) {
  let index = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= time) index = i;
    else break;
  }
  return index;
}

function findActiveWordIndex(words, time) {
  let index = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].time <= time) index = i;
    else break;
  }
  return index;
}

function applyWordStates(lineNodes, lineIndex, wordIndex) {
  lineNodes.forEach((lineNode, li) => {
    const wordNodes = lineNode.querySelectorAll(".lyric-word");
    wordNodes.forEach((wordNode, wi) => {
      wordNode.classList.remove("sung", "active", "upcoming");

      if (lineIndex < 0) {
        wordNode.classList.add("upcoming");
        return;
      }

      if (li < lineIndex) {
        wordNode.classList.add("sung");
      } else if (li > lineIndex) {
        wordNode.classList.add("upcoming");
      } else if (wordIndex < 0) {
        wordNode.classList.add("upcoming");
      } else if (wi < wordIndex) {
        wordNode.classList.add("sung");
      } else if (wi === wordIndex) {
        wordNode.classList.add("active");
      } else {
        wordNode.classList.add("upcoming");
      }
    });
  });
}
function scrollActiveLineIntoView(nodes, index) {
  const activeNode = nodes[index];
  if (!activeNode || !lyricsScrollEl) return;

  const scrollRect = lyricsScrollEl.getBoundingClientRect();
  const nodeRect = activeNode.getBoundingClientRect();
  const nodeCenter = nodeRect.top + nodeRect.height / 2;
  const scrollCenter = scrollRect.top + scrollRect.height / 2;
  const delta = nodeCenter - scrollCenter;

  lyricsScrollEl.scrollTop += delta;
}

function updateLyrics(time, force = false) {
  if (!lyrics.length || !lyricsScrollEl) return;

  const lineIndex = findActiveLineIndex(time);
  const wordIndex =
    lineIndex >= 0
      ? findActiveWordIndex(lyrics[lineIndex].words, time)
      : -1;

  const lineChanged = lineIndex !== activeLineIndex;
  const wordChanged = wordIndex !== activeWordIndex;
  if (!force && !lineChanged && !wordChanged) return;

  activeLineIndex = lineIndex;
  activeWordIndex = wordIndex;

  const lineNodes = lyricsScrollEl.querySelectorAll(".lyric-line");
  lineNodes.forEach((lineNode, i) => {
    lineNode.classList.remove("active", "past", "next", "upcoming");
    if (i === lineIndex) lineNode.classList.add("active");
    else if (i < lineIndex) lineNode.classList.add("past");
    else if (i === lineIndex + 1) lineNode.classList.add("next");
    else lineNode.classList.add("upcoming");
  });

  applyWordStates(lineNodes, lineIndex, wordIndex);

  if (lineIndex >= 0 && (lineChanged || force)) {
    scrollActiveLineIntoView(lineNodes, lineIndex);
  }
}

function tick() {
  const t = audio.currentTime;
  timeCurrentEl.textContent = formatTime(t);
  if (audio.duration) {
    progressEl.value = String(Math.round((t / audio.duration) * 1000));
  }
  updateLyrics(t);
  rafId = requestAnimationFrame(tick);
}

function startTick() {
  stopTick();
  rafId = requestAnimationFrame(tick);
}

function stopTick() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

async function selectSong(song) {
  stopTick();
  audio.pause();
  currentSong = song;
  lyrics = parseLrc(song.lrc);
  activeLineIndex = -1;
  activeWordIndex = -1;

  currentTitleEl.textContent = song.title;
  audio.src = song.audioUrl;
  audio.currentTime = 0;

  renderSongList();
  renderLyrics();
  updateLyrics(0, true);
  setControlsEnabled(true);
  btnPlay.textContent = "▶";

  timeCurrentEl.textContent = "0:00";
  timeTotalEl.textContent = "0:00";
  progressEl.value = "0";

  try {
    await audio.play();
    btnPlay.textContent = "⏸";
    startTick();
  } catch {
    btnPlay.textContent = "▶";
  }
}

async function togglePlay() {
  if (!currentSong) return;

  if (audio.paused) {
    await audio.play();
    btnPlay.textContent = "⏸";
    startTick();
  } else {
    audio.pause();
    btnPlay.textContent = "▶";
    stopTick();
  }
}

function restartSong() {
  if (!currentSong) return;
  audio.currentTime = 0;
  updateLyrics(0, true);
  timeCurrentEl.textContent = "0:00";
  progressEl.value = "0";
  if (!audio.paused) startTick();
}

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  return audioContext;
}

async function setMicEnabled(enabled) {
  if (enabled === micEnabled) return;

  if (!enabled) {
    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }
    if (micGain) {
      micGain.disconnect();
      micGain = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }
    micEnabled = false;
    btnMic.classList.remove("on");
    micStatusEl.textContent = "Microfone desligado";
    micStatusEl.classList.remove("on");
    return;
  }

  try {
    const ctx = await ensureAudioContext();
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    micSource = ctx.createMediaStreamSource(micStream);
    micGain = ctx.createGain();
    micGain.gain.value = 1;
    micSource.connect(micGain);
    micGain.connect(ctx.destination);

    micEnabled = true;
    btnMic.classList.add("on");
    micStatusEl.textContent = "Microfone ligado — você se escuta no fone/caixa";
    micStatusEl.classList.add("on");
  } catch (err) {
    micEnabled = false;
    btnMic.classList.remove("on");
    micStatusEl.textContent = "Não foi possível acessar o microfone";
    micStatusEl.classList.remove("on");
    console.error(err);
  }
}

async function loadSongs() {
  songs = await window.karaoke.listSongs();
  renderSongList();

  if (songs.length === 0) {
    currentSong = null;
    setControlsEnabled(false);
    currentTitleEl.textContent = "Escolha uma música";
    lyricsViewport.innerHTML =
      '<p class="lyrics-placeholder">Adicione MP3 + LRC na pasta <code>songs/</code></p>';
  } else if (currentSong) {
    const stillThere = songs.find((s) => s.id === currentSong.id);
    if (!stillThere) {
      currentSong = null;
      setControlsEnabled(false);
    } else {
      currentSong = stillThere;
      renderSongList();
    }
  }
}

btnPlay.addEventListener("click", togglePlay);
btnRestart.addEventListener("click", restartSong);
btnMic.addEventListener("click", () => setMicEnabled(!micEnabled));
btnRefresh.addEventListener("click", loadSongs);

audio.addEventListener("loadedmetadata", () => {
  timeTotalEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("ended", () => {
  btnPlay.textContent = "▶";
  stopTick();
});

progressEl.addEventListener("input", () => {
  if (!audio.duration) return;
  const ratio = Number(progressEl.value) / 1000;
  audio.currentTime = audio.duration * ratio;
  updateLyrics(audio.currentTime, true);
  timeCurrentEl.textContent = formatTime(audio.currentTime);
});

loadSongs();
