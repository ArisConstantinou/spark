using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using CSMath;
using System.Text;
using System.Text.Json;

var passed=new List<string>();
void Assert(bool value,string message){if(!value)throw new Exception(message);}
byte[] Dxf(CadDocument doc){using var bytes=new MemoryStream();using(var writer=new DxfWriter(bytes,doc,false))writer.Write();return bytes.ToArray();}
double[] Bounds(JsonElement scene,string owner){var boxes=scene.GetProperty("items").EnumerateArray().Where(i=>i.GetProperty("owner").GetString()==owner).Select(i=>i.GetProperty("bounds").EnumerateArray().Select(v=>v.GetDouble()).ToArray()).ToArray();if(boxes.Length==0)throw new Exception("Source object did not render: "+owner);return[boxes.Min(b=>b[0]),boxes.Min(b=>b[1]),boxes.Max(b=>b[2]),boxes.Max(b=>b[3])];}
void Test(string name,Func<Entity> create){
 var doc=new CadDocument();doc.Header.InsUnits=ACadSharp.Types.Units.UnitsType.Millimeters;
 var entity=create();doc.Entities.Add(entity);if(entity is DimensionAligned dimension)dimension.UpdateBlock();
 var control=new Circle{Center=new XYZ(500,500,0),Radius=5};doc.Entities.Add(control);
 var original=Dxf(doc);using var beforeDoc=JsonDocument.Parse(CadEngine.Import(original,"dxf"));var before=beforeDoc.RootElement;
 string owner=entity.Handle.ToString(),other=control.Handle.ToString();var box=Bounds(before,owner);var controlBox=Bounds(before,other);
 foreach(string format in new[]{"dxf","dwg"}){
  var request=new{factor=1,original=Convert.ToBase64String(original),originalFormat="dxf",cadMoves=new Dictionary<string,object>{{owner,new{dx=20,dy=30}}},segments=Array.Empty<object>(),labels=Array.Empty<object>()};
  var output=CadEngine.Export(JsonSerializer.SerializeToUtf8Bytes(request),format);using var afterDoc=JsonDocument.Parse(CadEngine.Import(output,format));var after=afterDoc.RootElement;var moved=Bounds(after,owner);var unchanged=Bounds(after,other);
  for(int n=0;n<4;n++){Assert(Math.Abs(moved[n]-box[n]-(n%2==0?20:30))<.001,name+" "+format+" moved bounds mismatch.");Assert(Math.Abs(unchanged[n]-controlBox[n])<.001,name+" changed another source object.");}
  Assert(after.GetProperty("unsupported").GetRawText()==before.GetProperty("unsupported").GetRawText(),name+" changed source coverage.");
 }
 passed.Add(name+" source movement survives DWG and DXF export");
}
Test("Line",()=>new Line{StartPoint=XYZ.Zero,EndPoint=new XYZ(100,25,0)});
Test("Block instance",()=>{var block=new BlockRecord("FixtureBlock");block.Entities.Add(new Line{StartPoint=XYZ.Zero,EndPoint=new XYZ(100,25,0)});block.Entities.Add(new Circle{Center=new XYZ(30,30,0),Radius=7});return new Insert(block){InsertPoint=new XYZ(10,20,0)};});
Test("Dimension picture",()=>new DimensionAligned(XYZ.Zero,new XYZ(100,0,0)){DefinitionPoint=new XYZ(0,15,0)});
Test("Solid",()=>new Solid{FirstCorner=XYZ.Zero,SecondCorner=new XYZ(100,0,0),ThirdCorner=new XYZ(0,50,0),FourthCorner=new XYZ(100,50,0)});
var emptyRequest=new{factor=1,original="",originalFormat="dwg",segments=new[]{new{a=new[]{0,0},b=new[]{1000,0}}},labels=new[]{new{x=10,y=20,height=5,text="SparkWorld verification"}}};
var added=CadEngine.Export(JsonSerializer.SerializeToUtf8Bytes(emptyRequest),"dwg");using(var scene=JsonDocument.Parse(CadEngine.Import(added,"dwg")))Assert(scene.RootElement.GetProperty("items").EnumerateArray().Any(i=>i.TryGetProperty("text",out var t)&&t.GetString()=="SparkWorld verification"),"Added annotations missing.");passed.Add("New vector annotations survive native DWG export");
bool rejected=false;try{CadEngine.Import(Encoding.UTF8.GetBytes("not CAD"),"dwg");}catch{rejected=true;}Assert(rejected,"Corrupt input was accepted.");passed.Add("Corrupt DWG fails explicitly");
Console.WriteLine(JsonSerializer.Serialize(new{status="PASS",checks=passed}));
