using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;

namespace SparkWorld;
public static class App {
 [STAThread]public static void Main(string[] args){
  int outputArg=Array.IndexOf(args,"--qa-output");if(args.Contains("--qa")&&outputArg>=0&&outputArg+1<args.Length){string output=Path.GetFullPath(args[outputArg+1]);Directory.CreateDirectory(output);File.WriteAllText(Path.Combine(output,"desktop-qa.json"),"{\"status\":\"RUNNING\"}");File.WriteAllText(Path.Combine(output,"desktop-focus.json"),"{\"status\":\"RUNNING\"}");}
  var app=new Application();app.ShutdownMode=ShutdownMode.OnMainWindowClose;
  var window=new SparkWindow(args);app.MainWindow=window;app.Run(window);
 }
}
sealed class SparkWindow:Window {
 readonly WebView2 view=new WebView2();readonly string profile,webRoot;readonly bool qa;
 readonly Dictionary<string,MemoryStream> uploads=new Dictionary<string,MemoryStream>();
 readonly SemaphoreSlim cadGate=new SemaphoreSlim(1,1);bool closing;
 readonly HashSet<string> sources=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern bool ReleaseCapture();
 [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr h,int message,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
 internal SparkWindow(string[] args){
  qa=args.Contains("--qa");string Value(string flag,string fallback){int n=Array.IndexOf(args,flag);return n>=0&&n+1<args.Length?args[n+1]:fallback;}
  profile=Value("--profile",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"SparkWorld","UserData"));
  webRoot=Value("--web-root",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web"));
  Title="SparkWorld · Created by Aris";Width=1440;Height=940;MinWidth=720;MinHeight=520;
  WindowStyle=WindowStyle.None;ResizeMode=ResizeMode.CanResize;Background=new SolidColorBrush(Color.FromRgb(13,21,29));
  System.Windows.Shell.WindowChrome.SetWindowChrome(this,new System.Windows.Shell.WindowChrome{CaptionHeight=0,ResizeBorderThickness=new Thickness(6),GlassFrameThickness=new Thickness(0),CornerRadius=new CornerRadius(0)});
  if(qa){ShowActivated=false;ShowInTaskbar=false;Left=-32000;Top=-32000;}else WindowStartupLocation=WindowStartupLocation.CenterScreen;
  view.DefaultBackgroundColor=System.Drawing.Color.FromArgb(255,13,21,29);Content=view;
  Loaded+=async(_,__)=>await Initialize(args);
  Closing+=(s,e)=>{if(closing)return;e.Cancel=true;if(view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsJson("{\"event\":\"close-request\"}");};
  Closed+=(_,__)=>{foreach(var stream in uploads.Values)stream.Dispose();view.Dispose();};
 }
 async Task Initialize(string[] args){try{
  Directory.CreateDirectory(profile);var options=new CoreWebView2EnvironmentOptions();if(qa)options.AdditionalBrowserArguments="--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";var env=await CoreWebView2Environment.CreateAsync(null,profile,options);await view.EnsureCoreWebView2Async(env);
  var core=view.CoreWebView2;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreDefaultScriptDialogsEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.AreDevToolsEnabled=qa;
  core.SetVirtualHostNameToFolderMapping("sparkworld.local",webRoot,CoreWebView2HostResourceAccessKind.DenyCors);
  core.NavigationStarting+=(_,e)=>{if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out var u)||u.Scheme!="https"||u.Host!="sparkworld.local")e.Cancel=true;};
  core.NewWindowRequested+=(_,e)=>e.Handled=true;core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;
  core.WebMessageReceived+=async(_,e)=>{if(!e.Source.StartsWith("https://sparkworld.local/",StringComparison.Ordinal))return;await Receive(e.WebMessageAsJson);};
  core.Navigate("https://sparkworld.local/index.html");
  if(qa)await RunQa(args);
 }catch(Exception e){ShowFailure(e.Message);}}
 void ShowFailure(string message){
  var panel=new StackPanel{Margin=new Thickness(48),VerticalAlignment=VerticalAlignment.Center};panel.Children.Add(new TextBlock{Text="ϟ SparkWorld",FontSize=34,Foreground=new SolidColorBrush(Color.FromRgb(80,162,255))});panel.Children.Add(new TextBlock{Text="SparkWorld could not start",FontSize=24,Foreground=Brushes.White,Margin=new Thickness(0,24,0,12)});panel.Children.Add(new TextBlock{Text=message,FontSize=16,Foreground=Brushes.LightSteelBlue,TextWrapping=TextWrapping.Wrap});
  var button=new Button{Content="Close SparkWorld",Background=new SolidColorBrush(Color.FromRgb(8,117,255)),Foreground=Brushes.White,BorderThickness=new Thickness(0),Padding=new Thickness(24,12,24,12),FontSize=16,HorizontalAlignment=HorizontalAlignment.Left,Margin=new Thickness(0,24,0,0)};button.Click+=(_,__)=>{closing=true;Close();};panel.Children.Add(button);Content=panel;
  if(qa){Environment.ExitCode=2;closing=true;Close();}
 }
 async Task Receive(string json){string id="";try{
  using var parsed=JsonDocument.Parse(json);var root=parsed.RootElement;id=root.GetProperty("id").GetString()??"";string method=root.GetProperty("method").GetString()??"";var a=root.GetProperty("args");object? result;
  switch(method){
   case "app.info":result=new{name="SparkWorld",creator="Aris",version="0.2.1",cad=true,mode="desktop",decoder="ACadSharp 3.6.51 · native Windows"};break;
   case "qa.pointer":if(!qa)throw new InvalidOperationException("QA is disabled.");await view.CoreWebView2.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent",a.GetRawText());result=true;break;
   case "window.minimize":WindowState=WindowState.Minimized;result=true;break;
   case "window.maximize":WindowState=WindowState==WindowState.Maximized?WindowState.Normal:WindowState.Maximized;result=true;break;
   case "window.drag":if(GetAsyncKeyState(1)<0){ReleaseCapture();SendMessage(new WindowInteropHelper(this).Handle,0xA1,new IntPtr(2),IntPtr.Zero);}result=true;break;
   case "window.close":closing=true;Close();return;
   case "upload.begin":{long length=a.GetProperty("length").GetInt64();if(length<0||length>128L*1024*1024||uploads.Count>=2)throw new IOException("File is too large or another transfer is active.");string token=Guid.NewGuid().ToString("N");uploads.Add(token,new MemoryStream());result=new{token};break;}
   case "upload.chunk":{var stream=Upload(a);var bytes=Convert.FromBase64String(a.GetProperty("data").GetString()!);if(bytes.Length>131072||stream.Length+bytes.Length>128L*1024*1024)throw new IOException("Transfer exceeds its size limit.");stream.Write(bytes,0,bytes.Length);result=true;break;}
   case "upload.release":{string token=a.GetProperty("token").GetString()!;if(uploads.TryGetValue(token,out var stream)){stream.Dispose();uploads.Remove(token);}result=true;break;}
   case "cad.import":case "cad.export":{
    if(!await cadGate.WaitAsync(0))throw new IOException("Another CAD operation is running.");try{var bytes=Upload(a).ToArray();string format=a.GetProperty("format").GetString()!;result=await Task.Run<object>(()=>method=="cad.import"?JsonSerializer.Deserialize<JsonElement>(CadEngine.Import(bytes,format)):(object)new{base64=Convert.ToBase64String(CadEngine.Export(bytes,format))});}finally{cadGate.Release();}break;
   }
   case "file.list":result=await Task.Run(()=>ListFiles(a));break;
   case "file.read":{string path=ReadPath(a);var info=new FileInfo(path);if(info.Length>128L*1024*1024)throw new IOException("File exceeds the import limit.");var data=await Task.Run(()=>File.ReadAllBytes(path));sources.Add(info.FullName);result=new{name=info.Name,base64=Convert.ToBase64String(data)};break;}
   case "file.stat":{string path=ReadPath(a);var info=new FileInfo(path);result=new{exists=info.Exists,stamp=info.Exists?info.LastWriteTimeUtc.Ticks.ToString():"",length=info.Exists?info.Length:0};break;}
   case "file.save":result=await SaveFile(a);break;
   default:throw new InvalidOperationException("Unsupported desktop action.");
  }
  Reply(id,result);
 }catch(Exception e){Reply(id,null,e.Message);}}
 MemoryStream Upload(JsonElement a){string token=a.GetProperty("token").GetString()!;if(!uploads.TryGetValue(token,out var stream))throw new IOException("Transfer has expired.");return stream;}
 static string ReadPath(JsonElement a){string path=Path.GetFullPath(a.GetProperty("path").GetString()!);if(path.StartsWith(@"\\",StringComparison.Ordinal))throw new IOException("Use a local drive path.");return path;}
 object ListFiles(JsonElement a){
  string requested=a.TryGetProperty("path",out var p)?p.GetString()??"":"",path=string.IsNullOrWhiteSpace(requested)?Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments):Path.GetFullPath(requested);
  if(path.StartsWith(@"\\",StringComparison.Ordinal))throw new IOException("Use a local drive path.");
  string query=a.TryGetProperty("query",out var q)?q.GetString()??"":"";
  var directory=new DirectoryInfo(path);var matches=directory.EnumerateFileSystemInfos().Where(e=>(e.Attributes&(FileAttributes.Hidden|FileAttributes.System))==0&&e.Name.IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0).OrderBy(e=>e is DirectoryInfo?0:1).ThenBy(e=>e.Name,StringComparer.OrdinalIgnoreCase).Take(2001).ToArray();
  var entries=matches.Take(2000).Select(e=>new{name=e.Name,path=e.FullName,directory=e is DirectoryInfo,length=e is FileInfo file?file.Length:0,extension=e.Extension}).ToArray();
  return new{path=directory.FullName,parent=directory.Parent?.FullName,entries,truncated=matches.Length>2000,shortcuts=new[]{new{name="Documents",path=Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)},new{name="Downloads",path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),"Downloads")},new{name="Desktop",path=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)}}.Concat(DriveInfo.GetDrives().Where(d=>d.IsReady).Select(d=>new{name=d.Name,path=d.RootDirectory.FullName})).ToArray()};
 }
 async Task<object> SaveFile(JsonElement a){
  string path=ReadPath(a);var info=new FileInfo(path);string expected=a.TryGetProperty("stamp",out var stamp)?stamp.GetString()??"":"";
  if(sources.Contains(info.FullName))throw new IOException("Choose a different destination to preserve the imported source file.");
  if(info.Exists&&expected!=info.LastWriteTimeUtc.Ticks.ToString())throw new IOException("The destination changed. Review it again before overwriting.");
  var bytes=Upload(a).ToArray();if(!Directory.Exists(info.DirectoryName))throw new IOException("Choose an existing destination folder.");
  string temporary=path+".sparkworld-writing";bool created=false;
  try{using(var file=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){created=true;await file.WriteAsync(bytes,0,bytes.Length);file.Flush(true);}
   info.Refresh();if(info.Exists){if(expected!=info.LastWriteTimeUtc.Ticks.ToString())throw new IOException("The destination changed. Review it again before overwriting.");File.Replace(temporary,path,null);}else{if(expected.Length>0)throw new IOException("The destination was removed. Choose the file again.");File.Move(temporary,path);}
  }finally{if(created&&File.Exists(temporary))File.Delete(temporary);}return new{path=info.FullName,bytes=bytes.Length};
 }
 void Reply(string id,object? result,string? error=null){
  string json=JsonSerializer.Serialize(new{id,result,error});if(json.Length<262144){view.CoreWebView2.PostWebMessageAsJson(json);return;}
  string data=JsonSerializer.Serialize(result);for(int n=0;n<data.Length;n+=131072)view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new{id,chunk=data.Substring(n,Math.Min(131072,data.Length-n))}));view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new{id,chunked=true}));
 }
 async Task RunQa(string[] args){
  int arg=Array.IndexOf(args,"--qa-output");if(arg<0||arg+1>=args.Length)throw new ArgumentException("QA requires --qa-output.");string output=Path.GetFullPath(args[arg+1]);Directory.CreateDirectory(output);
  var foreground=GetForegroundWindow();var watch=Stopwatch.StartNew();
  try{
   while(await view.CoreWebView2.ExecuteScriptAsync("!!window.fyp")!="true"){if(watch.Elapsed.TotalSeconds>45)throw new TimeoutException("Desktop interface did not initialize.");await Task.Delay(100);}
   int fileArg=Array.IndexOf(args,"--dwg");string source=fileArg>=0&&fileArg+1<args.Length?args[fileArg+1]:"";
   await view.CoreWebView2.ExecuteScriptAsync("window.__qaSource="+JsonSerializer.Serialize(source)+";window.__qaOutput="+JsonSerializer.Serialize(output));
   string script=File.ReadAllText(Path.Combine(webRoot,"desktop-qa.js"));await view.CoreWebView2.ExecuteScriptAsync(script);
   string result;do{await Task.Delay(250);result=await view.CoreWebView2.ExecuteScriptAsync("window.__sparkQa?JSON.stringify(window.__sparkQa):null");if(watch.Elapsed.TotalSeconds>240)throw new TimeoutException("Desktop QA timed out.");}while(result=="null");
   string report=JsonSerializer.Deserialize<string>(result)!;using var parsed=JsonDocument.Parse(report);
   File.WriteAllText(Path.Combine(output,"desktop-qa.json"),report);using(var image=File.Create(Path.Combine(output,"desktop-qa.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,image);
   bool unchanged=foreground==GetForegroundWindow();File.WriteAllText(Path.Combine(output,"desktop-focus.json"),JsonSerializer.Serialize(new{unchanged,elapsedSeconds=watch.Elapsed.TotalSeconds}));
   Environment.ExitCode=parsed.RootElement.GetProperty("status").GetString()=="PASS"&&unchanged?0:1;
  }catch(Exception e){File.WriteAllText(Path.Combine(output,"desktop-qa.json"),JsonSerializer.Serialize(new{status="FAIL",error=e.ToString()}));Environment.ExitCode=1;}
  finally{closing=true;Close();}
 }
}
