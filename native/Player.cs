using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Threading;
using System.Security.Cryptography;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class Player : Form {
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd,int message,IntPtr wParam,IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] struct FrameRect { public int Left,Top,Right,Bottom; }
    [DllImport("user32.dll")] static extern bool AdjustWindowRectExForDpi(ref FrameRect rect,int style,bool menu,int exStyle,uint dpi);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int GetSystemMetricsForDpi(int index,uint dpi);
    protected override CreateParams CreateParams{
        get{
            var options=base.CreateParams;
            // WS_CAPTION stays on so Windows plays its native minimize / restore / open animations; the caption itself is removed in WM_NCCALCSIZE below.
            return options;
        }
    }
    protected override void WndProc(ref Message m){
        if(m.Msg==0x83 && m.WParam!=IntPtr.Zero && !lyricScreen){ // WM_NCCALCSIZE: client area = whole window (no native caption)
            if(WindowState==FormWindowState.Maximized){
                uint dpi=GetDpiForWindow(m.HWnd);
                int fx=GetSystemMetricsForDpi(32,dpi)+GetSystemMetricsForDpi(92,dpi);
                int fy=GetSystemMetricsForDpi(33,dpi)+GetSystemMetricsForDpi(92,dpi);
                Marshal.WriteInt32(m.LParam,0,Marshal.ReadInt32(m.LParam,0)+fx);
                Marshal.WriteInt32(m.LParam,4,Marshal.ReadInt32(m.LParam,4)+fy);
                Marshal.WriteInt32(m.LParam,8,Marshal.ReadInt32(m.LParam,8)-fx);
                Marshal.WriteInt32(m.LParam,12,Marshal.ReadInt32(m.LParam,12)-fy);
            }
            m.Result=IntPtr.Zero;
            return;
        }
        if(m.Msg==0x84 && !lyricScreen && WindowState==FormWindowState.Normal){ // WM_NCHITTEST: resize from the window edges
            base.WndProc(ref m);
            if(m.Result.ToInt32()==1){
                long lp=m.LParam.ToInt64();int x=(short)(lp&0xFFFF),y=(short)((lp>>16)&0xFFFF);
                Rectangle r=Bounds;int e=(int)(6*GetDpiForWindow(m.HWnd)/96);
                bool l=x<r.Left+e,rt=x>=r.Right-e,t=y<r.Top+e,bt=y>=r.Bottom-e;
                int ht=t?(l?13:rt?14:12):bt?(l?16:rt?17:15):l?10:rt?11:0;
                if(ht!=0)m.Result=(IntPtr)ht;
            }
            return;
        }
        base.WndProc(ref m);
        if(m.Msg==0x24 && !lyricScreen && m.LParam!=IntPtr.Zero){ // WM_GETMINMAXINFO
            var screen=Screen.FromHandle(m.HWnd);var work=screen.WorkingArea;var monitor=screen.Bounds;
            var rect=new FrameRect {Right=work.Width,Bottom=work.Height};var options=CreateParams;
            AdjustWindowRectExForDpi(ref rect,options.Style&~0x00C00000,false,options.ExStyle,GetDpiForWindow(m.HWnd));
            Marshal.WriteInt32(m.LParam,8,rect.Right-rect.Left);
            Marshal.WriteInt32(m.LParam,12,rect.Bottom-rect.Top);
            Marshal.WriteInt32(m.LParam,16,work.Left-monitor.Left+rect.Left);
            Marshal.WriteInt32(m.LParam,20,work.Top-monitor.Top+rect.Top);
        }
    }
    readonly WebView2 view = new WebView2();
    readonly string profile;
    readonly NotifyIcon tray = new NotifyIcon();
    readonly Catalogs catalogs;
    string batchFolder,batchTarget,batchPartial;
    readonly string cacheFolder=Path.Combine(Path.GetTempPath(),"Fader-"+Guid.NewGuid().ToString("N"));
    readonly Dictionary<string,System.Diagnostics.Process> transfers=new Dictionary<string,System.Diagnostics.Process>();
    async System.Threading.Tasks.Task QuickAudio(string url,string id){
        if(!System.Text.RegularExpressions.Regex.IsMatch(url,@"^https://soundcloud\.com/[\w-]+/[\w-]+/?$")||!ValidID(id))throw new ArgumentException();
        var tool=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"yt-dlp.exe");
        string path=Path.Combine(cacheFolder,id+".m4a");
        using(var proc=new System.Diagnostics.Process()){
            proc.StartInfo=new System.Diagnostics.ProcessStartInfo(tool,"--ignore-config --no-playlist --no-progress --fixup never --no-part --no-cache-dir --retries 2 --fragment-retries 2 --abort-on-unavailable-fragments -N 4 -f bestaudio -o \""+path+"\" -- "+url){CreateNoWindow=true,UseShellExecute=false};
            transfers.Add(id,proc);
            try{proc.Start();if(!await System.Threading.Tasks.Task.Run(()=>proc.WaitForExit(170000))){proc.Kill();throw new TimeoutException();}
                if(proc.ExitCode!=0||!File.Exists(path))throw new InvalidOperationException();
            }finally{transfers.Remove(id);}
        }
    }
    static bool ValidID(string id){Guid g;return Guid.TryParseExact(id,"D",out g);}
    void CancelTransfer(string id){
        System.Diagnostics.Process proc;
        if(transfers.TryGetValue(id,out proc))try{proc.Kill();}catch(InvalidOperationException){}
    }
    FileStream batchStream;
    [DllImport("shell32.dll")] static extern int SHGetKnownFolderPath(ref Guid id,uint flags,IntPtr token,out IntPtr path);
    static string DownloadsFolder(){
        var id=new Guid("374DE290-123F-4565-9164-39C4925E467B");IntPtr path;
        Marshal.ThrowExceptionForHR(SHGetKnownFolderPath(ref id,0,IntPtr.Zero,out path));
        try{return Marshal.PtrToStringUni(path);}finally{Marshal.FreeCoTaskMem(path);}
    }
    static string FileLabel(string name){
        var clean=new string(name.Select(c=>Path.GetInvalidFileNameChars().Contains(c)?'_':c).ToArray()).Trim().TrimEnd('.');
        if(clean.Length>90)clean=clean.Substring(0,90).TrimEnd(' ','.');
        if(clean.Length==0)clean="Playlist";
        if(System.Text.RegularExpressions.Regex.IsMatch(clean,@"^(CON|NUL|AUX|PRN|COM[1-9]|LPT[1-9])(\.|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase))clean="_"+clean;
        return clean;
    }
    void DiscardPartial(){
        if(batchStream!=null){batchStream.Dispose();batchStream=null;}
        if(batchPartial!=null&&File.Exists(batchPartial))File.Delete(batchPartial);
        batchPartial=null;
    }
    object BatchAction(string action,string name,string chunk){
        if(action=="batchBegin"){
            DiscardPartial();
            string parent=DownloadsFolder(),stem=FileLabel(name);
            string folder=Path.Combine(parent,stem);int n=2;
            while(Directory.Exists(folder)||File.Exists(folder))folder=Path.Combine(parent,stem+" ("+(n++)+")");
            Directory.CreateDirectory(folder);batchFolder=folder;return folder;
        }
        if(batchFolder==null)throw new InvalidOperationException();
        if(action=="batchFile"){
            DiscardPartial();batchTarget=Path.Combine(batchFolder,FileLabel(name)+".wav");
            batchPartial=Path.Combine(batchFolder,Guid.NewGuid().ToString("N")+".partial");
            batchStream=new FileStream(batchPartial,FileMode.CreateNew,FileAccess.Write,FileShare.None);
        }else if(action=="batchChunk"){
            if(chunk.Length>800000)throw new ArgumentException();
            var data=Convert.FromBase64String(chunk);batchStream.Write(data,0,data.Length);
        }else if(action=="batchCommit"){
            batchStream.Dispose();batchStream=null;File.Move(batchPartial,batchTarget);batchPartial=null;
        }else if(action=="batchDiscard"){DiscardPartial();}
        else if(action=="batchEnd"){DiscardPartial();batchFolder=null;}
        else throw new ArgumentException();
        return null;
    }
    CoreWebView2Environment environment;
    bool closeToTray, quitting;
    bool lyricScreen;
    Rectangle previousBounds;
    FormWindowState previousState;
    void LyricScreen(bool enabled){
        if(enabled==lyricScreen)return;
        lyricScreen=enabled;
        if(enabled){
            previousState=WindowState;previousBounds=WindowState==FormWindowState.Normal?Bounds:RestoreBounds;
            var monitor=Screen.FromControl(this);
            WindowState=FormWindowState.Normal;FormBorderStyle=FormBorderStyle.None;Bounds=monitor.Bounds;
        }else{
            FormBorderStyle=FormBorderStyle.Sizable;Bounds=previousBounds;WindowState=previousState;
        }
    }
    bool mini;
    Rectangle miniBounds;
    FormWindowState miniState;
    void Mini(bool on,bool tall){
        if(lyricScreen)return;
        if(on){
            if(!mini){miniState=WindowState;miniBounds=WindowState==FormWindowState.Normal?Bounds:RestoreBounds;}
            mini=true;WindowState=FormWindowState.Normal;MinimumSize=Size.Empty;
            Rectangle area=Screen.FromControl(this).WorkingArea;
            ClientSize=new Size(392,tall?372:150);
            Location=new Point(area.Right-Width-16,area.Bottom-Height-16);
            TopMost=true;
        }else if(mini){
            mini=false;TopMost=false;MinimumSize=new Size(740,550);Bounds=miniBounds;WindowState=miniState;
        }
    }
    const string Home = "https://fader.example/index.html";
    public Player(string data) {
        profile = data;
        catalogs = new Catalogs(data);
        closeToTray = !File.Exists(Path.Combine(data,"exit-on-close"));
        Text = "Fader";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Color.FromArgb(9, 9, 10);
        MinimumSize = new Size(740, 550);
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        Size = new Size(Math.Min(1400, area.Width), Math.Min(875, area.Height));
        StartPosition = FormStartPosition.CenterScreen;
        view.DefaultBackgroundColor = BackColor;
        view.Dock = DockStyle.Fill;
        Controls.Add(view);
        var menu=new FaderTrayMenu((s,e)=>RestorePlayer(),(s,e)=>{quitting=true;Close();});
        tray.Icon=Icon;tray.Text="Fader";tray.ContextMenuStrip=menu;
        tray.MouseClick+=(s,e)=>{if(e.Button==MouseButtons.Left)RestorePlayer();};
        FormClosing+=(s,e)=>{if(!quitting && closeToTray && e.CloseReason==CloseReason.UserClosing && view.CoreWebView2!=null){
            e.Cancel=true;tray.Visible=true;Hide();
        }};
        FormClosed+=(s,e)=>{foreach(var id in transfers.Keys.ToArray())CancelTransfer(id);try{Directory.Delete(cacheFolder,true);}catch(IOException){}DiscardPartial();tray.Visible=false;tray.Dispose();menu.Dispose();catalogs.Dispose();};
        Shown += Open;
    }
    public void RestorePlayer(){Show();if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Activate();tray.Visible=false;}
    void Reply(object result){if(!IsDisposed && !Disposing && view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsJson(Catalogs.Json.Serialize(result));}
    async void Message(object sender,CoreWebView2WebMessageReceivedEventArgs args){
        if(args.Source!=Home)return;
        int seq=0;
        try{
            var d=Catalogs.Json.Deserialize<Dictionary<string,object>>(args.WebMessageAsJson);
            if(d==null||!Int32.TryParse(Catalogs.Str(d,"seq"),out seq))return;
            string action=Catalogs.Str(d,"action"),name=Catalogs.Str(d,"name"),query=Catalogs.Str(d,"query").Trim();
            object value=null;
            if(query.Length>300)query=query.Substring(0,300);
            if(action=="window"){
                if(name=="drag"&&!lyricScreen){ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);}
                else if(name=="maximize"&&!lyricScreen)WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;
                else if(name=="minimize")WindowState=FormWindowState.Minimized;
                else if(name=="mini"||name=="mini-tall"||name=="restore")Mini(name!="restore",name=="mini-tall");
                else if(name=="close"){Reply(new {seq,ok=true});Close();return;}
                value=WindowState==FormWindowState.Maximized;
            }else if(action.StartsWith("batch",StringComparison.Ordinal)){
                value=BatchAction(action,name,Catalogs.Str(d,"chunk"));
            }else if(action=="lyricsScreen"){
                LyricScreen(Catalogs.Str(d,"enabled")=="True");
            }else if(action=="mute"){
                view.CoreWebView2.IsMuted=Catalogs.Str(d,"enabled")=="True";
            }else if(action=="tray"){
                bool enabled=Catalogs.Str(d,"enabled")=="True";
                string file=Path.Combine(profile,"exit-on-close");
                if(enabled)File.Delete(file);else File.WriteAllText(file,"");
                closeToTray=enabled;
            }else if(action=="configure"){
                await catalogs.Configure(name,Catalogs.Str(d,"id").Trim(),Catalogs.Str(d,"secret").Trim());
            }else if(action=="search" && Catalogs.Names.Contains(name) && query.Length>0){
                value=await catalogs.Search(name,query);
            }else if(action=="quickAudio"){
                await QuickAudio(query,name);
            }else if(action=="quickCancel"&&ValidID(name)){
                CancelTransfer(name);
            }else if(action=="quickRelease"&&ValidID(name)){
                File.Delete(Path.Combine(cacheFolder,name+".m4a"));
            }else if(action=="soundDownload"){
                value=await catalogs.SoundDownload(query);
            }else if(action=="publicData"){
                value=await catalogs.PublicData(name,query,Catalogs.Str(d,"matches"));
            }else if(action!="state")return;
            Reply(new {seq,ok=true,value,closeToTray,configured=Catalogs.Names.Where(catalogs.Has).ToArray()});
        }catch{Reply(new {seq,ok=false});}
    }
    async void Open(object sender, EventArgs e) {
        try {
            int dark = 1;
            DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
            environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(profile, "WebView"));
            await view.EnsureCoreWebView2Async(environment);
            var core = view.CoreWebView2;
            Directory.CreateDirectory(cacheFolder);
            core.SetVirtualHostNameToFolderMapping("exports.fader.example",cacheFolder,CoreWebView2HostResourceAccessKind.Allow);
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.WebMessageReceived += Message;
            core.IsDocumentPlayingAudioChanged+=(s,a)=>Reply(new {audible=core.IsDocumentPlayingAudio});
            core.SetVirtualHostNameToFolderMapping("fader.example", Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ui"), CoreWebView2HostResourceAccessKind.Deny);
            core.SetVirtualHostNameToFolderMapping("playback.fader.example", Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ui", "playback"), CoreWebView2HostResourceAccessKind.DenyCors);
            string ui=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ui");
            await core.AddScriptToExecuteOnDocumentCreatedAsync("(function(){"+File.ReadAllText(Path.Combine(ui,"tone.js"))+"\n"+File.ReadAllText(Path.Combine(ui,"playback","embedded-tone.js"))+"\n})();");
            core.NavigationStarting += (s,a) => { a.Cancel = a.Uri != "https://fader.example/index.html"; };
            core.NewWindowRequested += (s,a) => { a.Handled = true; };
            core.Navigate(Home);
            view.Focus();
        } catch (Exception ex) {
            MessageBox.Show("Fader could not open its window. Verify that Microsoft Edge WebView2 Runtime is installed.\n\n" + ex.Message, "Fader");
            quitting=true;Close();
        }
    }
    [STAThread]
    public static void Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string data = Environment.GetEnvironmentVariable("FADER_DATA");
        if (String.IsNullOrEmpty(data)) data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Fader");
        string key;
        using(var hash=SHA256.Create())key=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(data).ToUpperInvariant()))).Replace("-","");
        bool owner;
        using(var mutex=new Mutex(true,"Local\\Fader."+key,out owner))
        using(var signal=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\Fader.Show."+key)){
            if(!owner){signal.Set();return;}
            using(var player=new Player(data)){
                var handle=player.Handle;
                var wait=ThreadPool.RegisterWaitForSingleObject(signal,(s,expired)=>{try{player.BeginInvoke(new Action(player.RestorePlayer));}catch(InvalidOperationException){}},null,-1,false);
                try{Application.Run(player);}finally{wait.Unregister(null);}
            }
        }
    }
}
