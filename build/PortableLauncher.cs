using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.ComponentModel;
using System.Linq;

[assembly: AssemblyTitle("ClipDesk")]
[assembly: AssemblyDescription("视频下载工作空间 · vibe coding by Haifeng.")]
[assembly: AssemblyCompany("Haifeng")]
[assembly: AssemblyProduct("ClipDesk")]
[assembly: AssemblyCopyright("vibe coding by Haifeng.")]
[assembly: AssemblyVersion("2.1.0.0")]
[assembly: AssemblyFileVersion("2.1.0.0")]

internal static class Program {
    internal const string PayloadHash = "__PAYLOAD_HASH__";
    [STAThread]
    static int Main(string[] args) {
        try {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string root = Environment.GetEnvironmentVariable("CLIPDESK_RUNTIME_ROOT");
            if (String.IsNullOrWhiteSpace(root)) root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ClipDesk", "runtime");
            string directory = Path.Combine(Path.GetFullPath(root), "2.1.0-" + PayloadHash.Substring(0, 12));
            string marker = Path.Combine(directory, ".complete");
            bool extractOnly = args.Contains("--extract-only");
            if (!File.Exists(marker) || File.ReadAllText(marker).Trim() != PayloadHash) {
                using (var splash = new SetupWindow(directory)) { Application.Run(splash); if (splash.Failure != null) throw splash.Failure; }
            }
            string executable = Path.Combine(directory, "ClipDesk.exe");
            if (!File.Exists(executable)) throw new IOException("启动文件不完整，请重新下载 ClipDesk。");
            if (extractOnly) return 0;
            string parameters = String.Join(" ", args.Select(Quote));
            Environment.SetEnvironmentVariable("ELECTRON_RUN_AS_NODE", null);
            var info = new ProcessStartInfo(executable, parameters) { WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true };
            Process child = Process.Start(info);
            if (args.Contains("--smoke-test")) { child.WaitForExit(); return child.ExitCode; }
            return 0;
        } catch (Exception error) {
            string report = Environment.GetEnvironmentVariable("CLIPDESK_TEST_REPORT");
            if (!String.IsNullOrEmpty(report)) File.WriteAllText(report, error.ToString());
            else MessageBox.Show(error.Message, "ClipDesk 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    static string Quote(string value) { return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }
    internal static void Extract(string directory, Action<int> update) {
        Directory.CreateDirectory(directory);
        string prefix = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ClipDesk.Payload")) {
            if (stream == null) throw new IOException("安装包缺少运行文件。");
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read)) {
                long total = archive.Entries.Sum(e => e.Length), done = 0;
                byte[] buffer = new byte[1024 * 1024];
                foreach (var entry in archive.Entries) {
                    string destination = Path.GetFullPath(Path.Combine(directory, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                    if (!destination.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new IOException("安装包路径无效。");
                    if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(destination); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    using (Stream input = entry.Open()) using (Stream output = File.Create(destination)) {
                        int count;
                        while ((count = input.Read(buffer, 0, buffer.Length)) > 0) { output.Write(buffer, 0, count); done += count; update(total > 0 ? (int)Math.Min(100, done * 100 / total) : 0); }
                    }
                }
            }
        }
        File.WriteAllText(Path.Combine(directory, ".complete"), PayloadHash);
    }
}

internal sealed class SetupWindow : Form {
    internal Exception Failure;
    readonly string directory;
    readonly ProgressBar progress;
    readonly Label status;
    public SetupWindow(string target) {
        directory = target;
        Text = "ClipDesk"; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen; ClientSize = new Size(470, 230); BackColor = Color.White; Font = new Font("Segoe UI", 10);
        try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }
        var title = new Label { Text = "ClipDesk", ForeColor = Color.FromArgb(230,57,53), Font = new Font("Segoe UI",24,FontStyle.Bold), Location = new Point(28,25), Size = new Size(350,44) };
        var detail = new Label { Text = "正在准备你的桌面工作空间", ForeColor = Color.FromArgb(102,114,131), Location = new Point(31,84), Size = new Size(395,27) };
        progress = new ProgressBar { Location = new Point(32,130), Size = new Size(407,8), Style = ProgressBarStyle.Continuous };
        status = new Label { Text = "首次启动准备中…", ForeColor = Color.FromArgb(153,163,179), Location = new Point(31,152), Size = new Size(395,24), Font = new Font("Segoe UI",9) };
        var credit = new Label { Text = "vibe coding by Haifeng.", ForeColor = Color.FromArgb(167,176,190), Location = new Point(31,191), Size = new Size(395,20), Font = new Font("Segoe UI",8) };
        Controls.AddRange(new Control[] { title, detail, progress, status, credit });
        Shown += (sender, e) => {
            var worker = new BackgroundWorker { WorkerReportsProgress = true };
            int last = -1;
            worker.DoWork += (s, eventArgs) => { Program.Extract(directory, value => { if (value != last) { last = value; worker.ReportProgress(value); } }); };
            worker.ProgressChanged += (s, eventArgs) => { progress.Value = eventArgs.ProgressPercentage; status.Text = "首次启动准备中 · " + eventArgs.ProgressPercentage + "%"; };
            worker.RunWorkerCompleted += (s, eventArgs) => { Failure = eventArgs.Error; Close(); };
            worker.RunWorkerAsync();
        };
    }
    protected override void OnFormClosing(FormClosingEventArgs e) { if (e.CloseReason == CloseReason.UserClosing && progress.Value < 100 && Failure == null) e.Cancel = true; base.OnFormClosing(e); }
}
