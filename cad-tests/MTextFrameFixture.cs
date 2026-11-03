using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using CSMath;
using System.Text.Json;

// Authored, public regression data. Never depends on the user's drawings.
static class MTextFrameFixture {
 public static bool Run(string[] args) {
  if(args.Length==2&&args[0]=="--mtext-fixture") {
   var doc=new CadDocument();doc.Header.Version=ACadVersion.AC1032;
   var layer=new Layer("FRAME_TEST");doc.Layers.Add(layer);
   MText Text(string value,int flags,double x,bool columns=false) {
    var angle=Math.PI/7;
    var text=new MText{Value=value,InsertPoint=new XYZ(x,25,0),Height=2,RectangleWidth=18,AlignmentPoint=new XYZ(Math.Cos(angle),Math.Sin(angle),0),Layer=layer,BackgroundFillFlags=(BackgroundFillFlags)flags};
    if(columns){text.ColumnData.ColumnType=ColumnType.DynamicColumns;text.ColumnData.AutoHeight=false;text.ColumnData.Width=18;text.ColumnData.Gutter=3;text.ColumnData.Heights.Add(-2.07);}
    return text;
   }
   doc.Entities.Add(Text("Control Ω",0,0));doc.Entities.Add(Text("Frame Θ1",16,30));
   doc.Entities.Add(Text("Columns Θ2",16,60,true));doc.Entities.Add(Text("Fill control",1,90));doc.Entities.Add(Text("Frame and fill",17,120,true));
   var block=new BlockRecord("FRAMED_TEXT_BLOCK");block.Entities.Add(Text("Nested Θ4",16,0,true));doc.Entities.Add(new Insert(block){InsertPoint=new XYZ(150,20,0)});
   using(var writer=new DwgWriter(args[1],doc))writer.Write();
   Console.WriteLine(JsonSerializer.Serialize(new{status="PASS",fixture="authored MTEXT frames",count=Rows(DwgReader.Read(args[1])).Length}));return true;
  }
  if(args.Length==3&&args[0]=="--mtext-compare") {
   var before=Rows(DwgReader.Read(args[1]));var after=Rows(Path.GetExtension(args[2]).Equals(".dxf",StringComparison.OrdinalIgnoreCase)?DxfReader.Read(args[2]):DwgReader.Read(args[2]));
   var map=after.ToDictionary(e=>e.Handle);var missing=before.Where(e=>!map.ContainsKey(e.Handle)).ToArray();
   var changed=before.Where(e=>map.TryGetValue(e.Handle,out var value)&&JsonSerializer.Serialize(e)!=JsonSerializer.Serialize(value)).Select(e=>new{e.Handle,e.Flags}).ToArray();
   var extra=after.Where(e=>!before.Any(old=>old.Handle==e.Handle)).Select(e=>e.Handle).ToArray();
   Console.WriteLine(JsonSerializer.Serialize(new{status=missing.Length==0&&changed.Length==0&&extra.Length==0?"PASS":"FAIL",before=before.Length,after=after.Length,missing=missing.Select(e=>new{e.Handle,e.Flags}),changed,extra}));return true;
  }
  return false;
 }
 static TextRow[] Rows(CadDocument doc)=>doc.BlockRecords.SelectMany(block=>block.Entities.OfType<MText>().Select(text=>new TextRow(text.Handle.ToString("X"),block.Handle.ToString("X"),text.Value,(int)text.BackgroundFillFlags,text.Layer.Name,new[]{text.InsertPoint.X,text.InsertPoint.Y,text.InsertPoint.Z}.Select(Round).ToArray(),Round(text.Height),Round(text.Rotation),Round(text.RectangleWidth),Round(text.BackgroundScale),new ColumnRow((int)text.ColumnData.ColumnType,text.ColumnData.AutoHeight,text.ColumnData.FlowReversed,Round(text.ColumnData.Width),Round(text.ColumnData.Gutter),text.ColumnData.Heights.Select(Round).ToArray())))).OrderBy(e=>e.Handle).ToArray();
 static double Round(double value)=>double.Parse(value.ToString("G12",System.Globalization.CultureInfo.InvariantCulture),System.Globalization.CultureInfo.InvariantCulture);
 record TextRow(string Handle,string Owner,string Value,int Flags,string Layer,double[] Position,double Height,double Rotation,double Width,double BackgroundScale,ColumnRow Columns);
 record ColumnRow(int Type,bool AutoHeight,bool FlowReversed,double Width,double Gutter,double[] Heights);
}
