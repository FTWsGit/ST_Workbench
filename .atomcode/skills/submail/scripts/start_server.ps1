# start_server.ps1 - start server.py as a detached background process via WMI.
#
# Why WMI instead of Start-Process:
#   The AtomCode bash tool reaps processes spawned by a finished call (tested:
#   Start-Process children die on the next call). WMI's Win32_Process.Create
#   is hosted by the WMI service, outside the caller's process tree / Job
#   Object, and survives across bash calls.
#
# Why pythonw.exe instead of python.exe:
#   python.exe is a console app -> it opens a visible console window that shows
#   the HTTP access log. pythonw.exe is the GUI subsystem variant: it has no
#   console window at all. server.py redirects stdout/stderr to devnull when
#   they are None (as they are under pythonw), so it runs fine.
#
# Usage (called by cli.py, not meant to be run by hand):
#   powershell -NoProfile -ExecutionPolicy Bypass -File start_server.ps1 `
#       -PythonPath <full path to python.exe> -ServerPath <full path to server.py> -Port 8791
#
# Output: the new process PID (one line), for the caller to store in a pid file.

param(
    [Parameter(Mandatory = $true)][string]$PythonPath,
    [Parameter(Mandatory = $true)][string]$ServerPath,
    [Parameter(Mandatory = $true)][int]$Port
)

$ErrorActionPreference = "Stop"

# Derive pythonw.exe from python.exe (same directory).
$PythonW = Join-Path (Split-Path -Parent $PythonPath) "pythonw.exe"
if (-not (Test-Path $PythonW)) {
    $PythonW = $PythonPath
}

$cmdline = '"{0}" "{1}" {2}' -f $PythonW, $ServerPath, $Port
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $cmdline
}

if ($r.ReturnValue -ne 0) {
    throw "Win32_Process.Create failed, ReturnValue=$($r.ReturnValue)"
}

Write-Output $r.ProcessId
