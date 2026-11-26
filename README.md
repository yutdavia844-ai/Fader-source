# Fader

Fader is a music player for Windows x64. It uses the installed Microsoft Edge WebView2 Runtime and the .NET Framework. Double-click Fader.exe, press Play EP, or drag your own audio files into the library. Local playback works offline.

## Search

Home opens with Explore and your local library. As you listen, In rotation ranks tracks by real listening time and For you combines library matches with public Audius tracks in your most-heard genre. Likes, early skips and recency affect the ranking. The player saves the listening history on this Windows account. Once the app has an artist but no genre tag, it can look up public artist tags on MusicBrainz. Audius receives a genre query to find playable tracks. Cached suggestions and the local library remain available offline, and online tracks need a connection to play.

Search stays inside Fader. Choose All, Library, SoundCloud, YouTube or Spotify, then type a query or press Enter. Select the top result or a song to play it with the bottom transport. Search, browse playlists and return to Home while the current track continues. The right panel shows the current cover or the YouTube video. Streaming uses the provider's embedded playback API. Availability and preview length depend on the service and recording. The same four sound tabs are available throughout the library and playlists. Streaming changes take effect when the recording connects to the audio processor. Availability depends on the recording and how the provider delivers its audio.

The public search reader extracts track entries from public SoundCloud and YouTube search responses. Spotify results without credentials use Deezer candidate metadata matched to Spotify track IDs through the ListenBrainz public index. Coverage can differ from a direct Spotify API search. Settings → Search services supports your own official API credentials. Searches use the Windows HTTP client or the system Node.js installation when available. No external browser is needed for search.

## Playlists

Open **Add tracks** to search inside the playlist. Choose a source and click a result to add it. A check marks each saved track. Right-click a playlist to pin its cover to the sidebar, edit it or export its references. Drag tracks by their titles or handles to save the playing order.

Right-click a song for **Like**, **Add to playlist** and **Download**. The download dialog renders WAV audio with its own trim, sample rate, bit depth, EQ, speed, pitch, distortion, echo and reverb. It can use imported audio, bundled tracks and available provider downloads. For SoundCloud, Fader first tries an available original through the configured connection. Otherwise the bundled yt-dlp helper downloads the available public audio before offline rendering. A local file can also be used. Open **Download playlist** for per-track trim and effects. Fader writes numbered WAVs in a new playlist folder in Downloads and lists any tracks that need another attempt. Open **Trim** to drag the start and end handles on the waveform. Preview the selection and choose **Apply trim** to use it for the WAV.

Click Library in the left rail to expand or collapse it. Liked tracks are pinned at the top. The plus icon creates a playlist and the folder imports Fader JSON, M3U or M3U8. Use the plus beside a track to add it to a playlist. Open a playlist and click the pencil to edit its name, cover and description. Its controls also add or remove tracks and export a Fader JSON file. Imported local paths resolve against files already in the library. Unmatched entries are reported. Fader JSON carries playlist metadata and track references. Audio files stay in the library. Online tracks use the provider player and can be selected individually.

## Audio controls

The sliders button at the bottom right opens the floating effects panel. Speed and pitch work on local files, Audius, and supported streaming tracks. The chain icon links Speed and Pitch. Doubling speed raises the pitch by an octave. Halving it lowers the pitch by an octave. Unlink them for independent adjustment. Speed changes glide into place during playback. Existing independent custom values are preserved on update.

The other tabs contain the five-band equalizer, sound effects and transitions. The wave tab combines distortion, reverb and echo with Dry, Room, Dub and Haze presets. The save icon stores the current EQ band gains as a named preset. Bypass compares the processing with the original signal. Reset audio settings restores the defaults.

Crossfade sets the overlap between decoded tracks in seconds. Streaming uses a fade at the beginning and end of each recording. Set it to zero for gapless scheduling. A source recording can contain its own trailing or leading silence. Like a track with the heart, then open Liked tracks in the sidebar. Settings includes reduced motion, position memory and management of imported tracks.

Hover just inside the top edge to reveal the sliding title bar. Drag its empty area to move the window or double-click to maximize or restore. Escape dismisses an open selector. The sleep timer in Settings pauses the current session after 15, 30 or 60 minutes, including while Fader is in the tray.

Close to tray is enabled by default. Closing the window keeps the player running in the Windows notification area. Click its tray icon or launch Fader again to restore the same window. Right-click the icon and choose Quit Fader to exit. Switch off Close to tray to exit using the window's close button.

The sidebar includes Recently played and Most played for this Windows profile. Each listening session counts once after ten seconds or half the track for recordings shorter than twenty seconds. Historical entries from earlier versions can show listening time until a new play is counted.

## Lyrics

Now playing looks up the current recording on LRCLIB using its title and artist and compares the duration when available. Timed lines follow playback and can seek the player. Plain lyrics can be read or scrolled manually. Spotify previews show text without synchronization because their start point in the full recording can vary.

The pencil opens the local lyric editor. Paste text, import a TXT or LRC file, or use **Stamp line** while listening to save the current time and advance to the next line. Save an empty edit to return to online lookup. Lyrics settings adjust the text size, follow mode and per-track timing delay. Use the expand icon to enter full screen and Escape to return.

The translation button sends the lyric lines to MyMemory when you choose **Translate**. Choose the original and target languages. The translation appears beneath each original line and is cached with the track on this device. Public service limits and recording availability can affect online features.

## Storage

The launcher unpacks its shipped application resources under the current user's LocalAppData Fader folder. Updates use the same library and preferences. Imports are copies kept in the WebView profile. Removing an import from Settings deletes its library copy. Audio is decoded for playback, so RAM usage depends on track length and overlap.

## Build

Run the following command from this directory in PowerShell on Windows x64 with the .NET Framework 4.x compiler installed.

```powershell
.\build.ps1
```

The script downloads the pinned Microsoft WebView2 SDK from NuGet and builds dist/Fader.exe. To use a locally extracted copy of the SDK, pass its directory with -Sdk. The source includes the four rendered original tracks. To render the arrangements again, use Node.js and an ffmpeg build with libvorbis.

```powershell
node compose.cjs C:\path\to\ffmpeg.exe
```

The ui directory contains the interface, audio engine and bundled media. The native directory contains the Windows host and launcher. Third-party notices are in notices.

## Artwork

The EP sleeve in ui/media/afterimage.jpg was generated with the built-in ImageGen tool. The prompt requested a square, text-free analog studio photograph of glowing vermilion optical filaments folded into a ribbon against an ink-black background, with tactile film grain and full-bleed framing.
