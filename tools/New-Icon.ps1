param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$pngs=@()
foreach($size in @(16,32,48,64,128,256)) {
 $bitmap=[System.Drawing.Bitmap]::new($size,$size)
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
 $graphics.Clear([System.Drawing.Color]::FromArgb(255,9,28,45))
 $points=@(@(23,3),@(10,22),@(20,22),@(16,37),@(31,15),@(21,15)) | ForEach-Object {[System.Drawing.PointF]::new($_[0]*$size/40,$_[1]*$size/40)}
 $brush=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,61,154,255))
 $graphics.FillPolygon($brush,[System.Drawing.PointF[]]$points)
 $stream=[System.IO.MemoryStream]::new();$bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
 $pngs+=,@{Size=$size;Bytes=$stream.ToArray()};$stream.Dispose();$brush.Dispose();$graphics.Dispose();$bitmap.Dispose()
}
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($OutputPath)) | Out-Null
$file=[System.IO.File]::Create($OutputPath);$writer=[System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$pngs.Count)
$offset=6+16*$pngs.Count
foreach($png in $pngs){$dimension=if($png.Size -eq 256){0}else{$png.Size};$writer.Write([byte]$dimension);$writer.Write([byte]$dimension);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$png.Bytes.Length);$writer.Write([uint32]$offset);$offset+=$png.Bytes.Length}
foreach($png in $pngs){$writer.Write([byte[]]$png.Bytes)}
$writer.Dispose()
