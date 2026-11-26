using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

class Launcher {
    [STAThread] static void Main() {
        try {
            var self = Assembly.GetExecutingAssembly();
            string data = Environment.GetEnvironmentVariable("FADER_DATA");
            if (String.IsNullOrEmpty(data)) data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Fader");
            string builds = Path.Combine(data, "builds");
            Directory.CreateDirectory(builds);
            string target = Path.Combine(builds, self.ManifestModule.ModuleVersionId.ToString("N"));
            if (!Directory.Exists(target)) {
                string stage = Path.Combine(builds, "staging-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(stage);
                try {
                    using (var stream = self.GetManifestResourceStream("Fader.zip"))
                    using (var zip = new ZipArchive(stream, ZipArchiveMode.Read)) zip.ExtractToDirectory(stage);
                    try { Directory.Move(stage, target); }
                    catch (IOException) { if (!Directory.Exists(target)) throw; }
                } finally { if (Directory.Exists(stage)) Directory.Delete(stage, true); }
            }
            Process.Start(new ProcessStartInfo(Path.Combine(target,"Fader.Player.exe")) { WorkingDirectory = target, UseShellExecute = false });
        } catch(Exception ex) { MessageBox.Show(ex.Message, "Fader"); }
    }
}
