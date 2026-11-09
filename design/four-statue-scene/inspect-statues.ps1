$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$drawingDir = Split-Path ([Drawing.Bitmap].Assembly.Location)
$refs = @([Drawing.Bitmap].Assembly.Location, [Drawing.Rectangle].Assembly.Location, (Join-Path $drawingDir 'System.Private.Windows.Core.dll'), (Join-Path $drawingDir 'System.Private.Windows.GdiPlus.dll'))
Add-Type -ReferencedAssemblies $refs @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class AlphaBounds {
  public static int[] Get(string file) {
    using (var bitmap = new Bitmap(file)) {
      var rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
      var data = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      try {
        int minX = bitmap.Width, minY = bitmap.Height, maxX = -1, maxY = -1;
        byte[] row = new byte[Math.Abs(data.Stride)];
        for (int y = 0; y < bitmap.Height; y++) {
          Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), row, 0, row.Length);
          for (int x = 0; x < bitmap.Width; x++) {
            if (row[x * 4 + 3] > 8) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < minX) return new int[] {bitmap.Width, bitmap.Height, 0, 0, 0, 0};
        return new int[] {bitmap.Width, bitmap.Height, minX, minY, maxX - minX + 1, maxY - minY + 1};
      } finally { bitmap.UnlockBits(data); }
    }
  }
}
'@

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$items = @{}
Get-ChildItem -LiteralPath (Join-Path $root 'statues') -Filter '*.png' | ForEach-Object {
  $b = [AlphaBounds]::Get($_.FullName)
  $items[$_.BaseName] = [ordered]@{
    file = "statues/$($_.Name)"
    sourceSize = @($b[0], $b[1])
    alphaBounds = @($b[2], $b[3], $b[4], $b[5])
  }
}
$items | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'statue-bounds.json') -Encoding utf8
Write-Output "Inspected $($items.Count) transparent sprites"
