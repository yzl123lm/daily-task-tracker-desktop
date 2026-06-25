param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Password = "",
  [string]$OutFile = ""
)
$ErrorActionPreference = "Stop"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  if ($Password) {
    $wb = $excel.Workbooks.Open($Path, 0, $true, 5, $Password)
  } else {
    $wb = $excel.Workbooks.Open($Path)
  }
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($ws in $wb.Worksheets) {
    $used = $ws.UsedRange
    if (-not $used) { continue }
    $lines.Add("## $($ws.Name)")
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count
    for ($r = 1; $r -le $rows; $r++) {
      $cells = @()
      for ($c = 1; $c -le $cols; $c++) {
        $cells += [string]$used.Cells.Item($r, $c).Text
      }
      $line = ($cells -join ",")
      if ($line.Trim().Length -gt 0) {
        $lines.Add($line)
      }
    }
  }
  $wb.Close($false)
  $payload = ($lines -join "`n")
  if ($OutFile) {
    [System.IO.File]::WriteAllText($OutFile, $payload, [System.Text.UTF8Encoding]::new($false))
  } else {
    Write-Output $payload
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
