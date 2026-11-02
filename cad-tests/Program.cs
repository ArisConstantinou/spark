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
  JsonElement[] Patterns(JsonElement scene)=>scene.GetProperty("items").EnumerateArray().Where(i=>i.GetProperty("owner").GetString()==owner&&i.TryGetProperty("patterns",out var p)&&p.ValueKind==JsonValueKind.Array).SelectMany(i=>i.GetProperty("patterns").EnumerateArray()).ToArray();
  var oldPatterns=Patterns(before);var newPatterns=Patterns(after);Assert(oldPatterns.Length==newPatterns.Length,name+" changed hatch families.");
  for(int p=0;p<oldPatterns.Length;p++)foreach(string field in new[]{"basePoint","axis","step","dashes"}){var a=oldPatterns[p].GetProperty(field).EnumerateArray().Select(v=>v.GetDouble()).ToArray();var b=newPatterns[p].GetProperty(field).EnumerateArray().Select(v=>v.GetDouble()).ToArray();Assert(a.Length==b.Length,name+" changed pattern data.");for(int n=0;n<a.Length;n++)Assert(Math.Abs(b[n]-a[n]-(field=="basePoint"?(n==0?20:30):0))<.00001,name+" changed hatch "+field);}
 }
 passed.Add(name+" source movement survives DWG and DXF export");
}
Test("Line",()=>new Line{StartPoint=XYZ.Zero,EndPoint=new XYZ(100,25,0)});
Test("Block instance",()=>{var block=new BlockRecord("FixtureBlock");block.Entities.Add(new Line{StartPoint=XYZ.Zero,EndPoint=new XYZ(100,25,0)});block.Entities.Add(new Circle{Center=new XYZ(30,30,0),Radius=7});return new Insert(block){InsertPoint=new XYZ(10,20,0)};});
Test("Mirrored rotated block",()=>{var block=new BlockRecord("MirroredBlock");block.Entities.Add(new Line{StartPoint=XYZ.Zero,EndPoint=new XYZ(100,25,0)});block.Entities.Add(new Circle{Center=new XYZ(30,30,0),Radius=7});return new Insert(block){InsertPoint=new XYZ(10,20,0),Rotation=Math.PI*.5,XScale=-.75,YScale=.5};});
Test("Dimension picture",()=>new DimensionAligned(XYZ.Zero,new XYZ(100,0,0)){DefinitionPoint=new XYZ(0,15,0)});
Test("Solid",()=>new Solid{FirstCorner=XYZ.Zero,SecondCorner=new XYZ(100,0,0),ThirdCorner=new XYZ(0,50,0),FourthCorner=new XYZ(100,50,0)});
Hatch FixtureHatch(XYZ normal){
 var h=new Hatch{Normal=normal,Elevation=3,PatternAngle=Math.PI/4,PatternScale=2};
 h.Pattern=new HatchPattern("SW_VERIFICATION");h.Pattern.Lines.Add(new HatchPattern.Line{Angle=Math.PI/4,BasePoint=new XY(3,7),Offset=new XY(5,10),DashLengths=new List<double>{8,-4,0,-4}});
 var boundary=new Hatch.BoundaryPath();var vertices=new[]{new XY(0,0),new XY(100,0),new XY(100,50),new XY(0,50)};
 for(int n=0;n<4;n++)boundary.Edges.Add(new Hatch.BoundaryPath.Line{Start=vertices[n],End=vertices[(n+1)%4]});h.Paths.Add(boundary);h.SeedPoints.Add(new XY(50,25));return h;
}
Test("Patterned hatch",()=>FixtureHatch(XYZ.AxisZ));
Test("Tilted OCS hatch",()=>FixtureHatch(new XYZ(.6,0,.8)));
Test("Circle",()=>new Circle{Center=new XYZ(20,30,0),Radius=7});
Test("Arc",()=>new Arc{Center=new XYZ(20,30,0),Radius=7,StartAngle=.2,EndAngle=2.5});
Spline SymbolSpline(){
 var spline=new Spline{Degree=2};spline.ControlPoints.AddRange([new XYZ(100,0,0),new XYZ(100,100,0),new XYZ(0,100,0)]);spline.Knots.AddRange([0,0,0,1,1,1]);spline.Weights.AddRange([1,Math.Sqrt(.5),1]);return spline;
}
Test("Rational spline",SymbolSpline);
Test("Spline symbol block",()=>{var block=new BlockRecord("Curved electrical symbol");block.Entities.Add(SymbolSpline());return new Insert(block){InsertPoint=new XYZ(200,100,0),XScale=-2,YScale=1.5,Rotation=.4};});
var splineDoc=new CadDocument();splineDoc.Header.InsUnits=ACadSharp.Types.Units.UnitsType.Millimeters;var quarter=SymbolSpline();splineDoc.Entities.Add(quarter);
using(var parsed=JsonDocument.Parse(CadEngine.Import(Dxf(splineDoc),"dxf"))){var scene=parsed.RootElement;Assert(scene.GetProperty("coverage").GetProperty("Spline").GetInt32()==1,"Spline remains missing from display coverage.");var curve=scene.GetProperty("items")[0];Assert(curve.GetProperty("sourceType").GetString()=="Spline","Spline source identity missing.");var tokens=System.Text.RegularExpressions.Regex.Matches(curve.GetProperty("d").GetString()!,@"-?\d+(?:\.\d+)?").Select(m=>double.Parse(m.Value,System.Globalization.CultureInfo.InvariantCulture)).ToArray();bool midpoint=false;for(int i=0;i<tokens.Length;i+=2)if(Math.Abs(tokens[i]-Math.Sqrt(.5)*100)<.01&&Math.Abs(tokens[i+1]+Math.Sqrt(.5)*100)<.01)midpoint=true;Assert(midpoint,"Rational spline was replaced with its control polygon.");passed.Add("NURBS symbol preserves its rational curve rather than its control polygon");}
var emptyRequest=new{factor=1,original="",originalFormat="dwg",segments=new[]{new{a=new[]{0,0},b=new[]{1000,0}}},labels=new[]{new{x=10,y=20,height=5,text="SparkWorld verification"}}};
var added=CadEngine.Export(JsonSerializer.SerializeToUtf8Bytes(emptyRequest),"dwg");using(var scene=JsonDocument.Parse(CadEngine.Import(added,"dwg")))Assert(scene.RootElement.GetProperty("items").EnumerateArray().Any(i=>i.TryGetProperty("text",out var t)&&t.GetString()=="SparkWorld verification"),"Added annotations missing.");passed.Add("New vector annotations survive native DWG export");
bool rejected=false;try{CadEngine.Import(Encoding.UTF8.GetBytes("not CAD"),"dwg");}catch{rejected=true;}Assert(rejected,"Corrupt input was accepted.");passed.Add("Corrupt DWG fails explicitly");
CadDocument LayerFixture(){
 var doc=new CadDocument();doc.Header.InsUnits=ACadSharp.Types.Units.UnitsType.Millimeters;
 var parent=new Layer("Block placement"){IsOn=false};var child=new Layer("Electrical symbols");var viewport=new Layer("New viewport only"){Flags=LayerFlags.FrozenNewViewports};var frozen=new Layer("Globally frozen"){Flags=LayerFlags.Frozen};var paper=new Layer("Paper geometry");var invisible=new Layer("Invisible source");
 foreach(var l in new[]{parent,child,viewport,frozen,paper,invisible,new Layer("Unused layer")})doc.Layers.Add(l);
 var block=new BlockRecord("Layer visibility fixture");block.Entities.Add(new Line{Layer=child,StartPoint=XYZ.Zero,EndPoint=new XYZ(500,300,0)});var curve=SymbolSpline();curve.Layer=child;block.Entities.Add(curve);block.Entities.Add(new ACadSharp.Entities.Point{Layer=invisible,Location=new XYZ(100,100,0)});doc.Entities.Add(new Insert(block){Layer=parent,InsertPoint=new XYZ(2000,3000,0)});
 doc.Entities.Add(new Circle{Layer=viewport,Center=new XYZ(4000,3000,0),Radius=300});doc.Entities.Add(new Line{Layer=frozen,StartPoint=new XYZ(5000,3000,0),EndPoint=new XYZ(5500,3300,0)});
 doc.Entities.Add(new Line{Layer=invisible,IsInvisible=true,StartPoint=new XYZ(6000,3000,0),EndPoint=new XYZ(6500,3300,0)});doc.PaperSpace.Entities.Add(new Line{Layer=paper,StartPoint=XYZ.Zero,EndPoint=new XYZ(100,100,0)});
 return doc;
}
var layerFixture=LayerFixture();var layerBytes=Dxf(layerFixture);using(var parsed=JsonDocument.Parse(CadEngine.Import(layerBytes,"dxf"))){
 var scene=parsed.RootElement;var list=scene.GetProperty("layers").EnumerateArray().ToDictionary(l=>l.GetProperty("name").GetString()!);
 Assert(list.Count==layerFixture.Layers.Count,"Unused and paper-only layers were dropped from inventory.");passed.Add("Complete source layer table includes unused and paper-only layers");
 Assert(list["New viewport only"].GetProperty("visible").GetBoolean(),"New viewport freeze incorrectly hides model geometry.");Assert(!list["Globally frozen"].GetProperty("visible").GetBoolean(),"Global freeze default was lost.");passed.Add("New-viewport freeze is distinct from global freeze");
 var part=scene.GetProperty("items").EnumerateArray().First(i=>i.GetProperty("layer").GetString()=="Electrical symbols");var deps=part.GetProperty("visibilityLayers").EnumerateArray().Select(x=>x.GetString()).ToArray();Assert(deps.Contains("Block placement")&&deps.Contains("Electrical symbols"),"Block layer dependency was lost.");passed.Add("Child layer geometry retains its hidden placement-layer dependency");
 Assert(list["Paper geometry"].GetProperty("paperObjects").GetInt32()==1,"Paper-space coverage was not identified.");Assert(scene.GetProperty("invisibleByLayer").GetProperty("Invisible source").GetInt32()==1,"Invisible source omission was not disclosed.");passed.Add("Paper-only and invisible-source geometry have explicit coverage reasons");
 Assert(scene.GetProperty("unsupportedByLayer").GetProperty("Block placement").GetProperty("Point").GetInt32()==1,"An unsupported child was not attributed to its controlling placement layer.");passed.Add("Unsupported block content explains parent-layer omissions");
}
Console.WriteLine(JsonSerializer.Serialize(new{status="PASS",checks=passed}));
if(args.Length==2&&args[0]=="--fixture"){
 var fixture=new CadDocument();fixture.Header.Version=ACadVersion.AC1032;fixture.Header.InsUnits=ACadSharp.Types.Units.UnitsType.Millimeters;fixture.Entities.Add(FixtureHatch(XYZ.AxisZ));fixture.Entities.Add(FixtureHatch(new XYZ(.6,0,.8)));
 var dim=new DimensionAligned(new XYZ(200,0,0),new XYZ(350,0,0)){DefinitionPoint=new XYZ(200,15,0)};fixture.Entities.Add(dim);dim.UpdateBlock();
 using var fixtureBytes=new MemoryStream();using(var writer=new DwgWriter(fixtureBytes,fixture))writer.Write();File.WriteAllBytes(args[1],fixtureBytes.ToArray());
 layerFixture.Header.Version=ACadVersion.AC1032;using var layerOutput=new MemoryStream();using(var writer=new DwgWriter(layerOutput,layerFixture))writer.Write();File.WriteAllBytes(Path.Combine(Path.GetDirectoryName(args[1])!,"layer-fixture.dwg"),layerOutput.ToArray());
}
if(args.Length==2&&args[0]=="--layer-fixture"){
 layerFixture.Header.Version=ACadVersion.AC1032;using var bytes=new MemoryStream();using(var writer=new DwgWriter(bytes,layerFixture))writer.Write();File.WriteAllBytes(args[1],bytes.ToArray());
}
