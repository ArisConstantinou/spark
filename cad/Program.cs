using System.Globalization;
using System.Text;
CultureInfo.CurrentCulture=CultureInfo.InvariantCulture;
CultureInfo.CurrentUICulture=CultureInfo.InvariantCulture;
try {
 using var input=new MemoryStream();await Console.OpenStandardInput().CopyToAsync(input);
 string mode=args.ElementAtOrDefault(0)??"import",format=args.ElementAtOrDefault(1)??"dwg";
 byte[] result=mode=="export"?CadEngine.Export(input.ToArray(),format):Encoding.UTF8.GetBytes(CadEngine.Import(input.ToArray(),format,mode=="inspect"));
 await Console.OpenStandardOutput().WriteAsync(result,0,result.Length);
}catch(Exception e){await Console.Error.WriteAsync(e.Message);Environment.ExitCode=2;}
