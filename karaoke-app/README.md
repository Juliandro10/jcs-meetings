# Karaokê (desktop)

App Electron para tocar MP3 com letras sincronizadas (arquivo `.lrc`).

## Como adicionar músicas

Coloque na pasta `songs/` um par de arquivos com **o mesmo nome**:

```
songs/
  Justin Bieber - GO BABY.mp3
  Justin Bieber - GO BABY.lrc
  Macarena - Los Del Río, Bayside Boys Remix.mp3
  Macarena - Los Del Río, Bayside Boys Remix.lrc
```

Só aparecem na lista as músicas que têm **MP3 + LRC**.

## Rodar (desenvolvimento)

```bash
cd C:\Stoll-Pr\karaoke-app
npm install
npm start
```

## Instalador (outro PC)

```bash
cd C:\Stoll-Pr\karaoke-app
npm install
npm run build
```

Gera o instalador em `dist/Karaoke Setup 1.0.0.exe`.

Na instalação, as músicas da pasta `songs/` vão junto. No outro PC, novas músicas ficam em:

`Documentos\Karaoke\songs\`

## Controles

- **Lista à esquerda** — escolher música
- **▶ / ⏸** — play e pause
- **⏮** — reiniciar
- **🎤** — ligar/desligar microfone (monitoramento local)
- **↻** — atualizar lista após adicionar arquivos
