using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

public static partial class BrowserCad {
 public static void Main() { }
 [JSExport,SupportedOSPlatform("browser")]
 public static string Import(byte[] bytes,string format)=>CadEngine.Import(bytes,format);
 [JSExport,SupportedOSPlatform("browser")]
 public static byte[] Export(byte[] bytes,string format)=>CadEngine.Export(bytes,format);
}
