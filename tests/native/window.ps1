param([Parameter(Mandatory)][string]$VaultName, [switch]$Activate)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ReviewNativeWindow {
 public delegate bool Callback(IntPtr handle, IntPtr state);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr state);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int command);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 public static List<IntPtr> Find(string vault) {
  var found = new List<IntPtr>();
  EnumWindows((h,s) => { var title = new StringBuilder(1024); GetWindowText(h,title,1024);
   if (title.ToString().Contains(" - " + vault + " - Obsidian")) found.Add(h); return true; }, IntPtr.Zero);
  return found;
 }
 public static void Activate(IntPtr h) {
  if (IsIconic(h)) ShowWindow(h,9);
  SetForegroundWindow(h);
  // Activation is asynchronous across input queues. Wait for the target's
  // message processing, without joining input queues or sending keystrokes.
  UIntPtr result; SendMessageTimeout(h,0,UIntPtr.Zero,IntPtr.Zero,2,1000,out result);
 }
 public static string Title(IntPtr h) { var title=new StringBuilder(1024); GetWindowText(h,title,1024); return title.ToString(); }
 public static bool Visible(IntPtr h) { return IsWindowVisible(h) && !IsIconic(h); }
 public static bool Focused(IntPtr h) { return GetForegroundWindow() == h; }
}
'@
$reviewWindows = [ReviewNativeWindow]::Find($VaultName)
if ($reviewWindows.Count -ne 1) {
    @{ visible = $false; focused = $false; reason = "Expected one vault window, found $($reviewWindows.Count)" } | ConvertTo-Json -Compress
    exit 0
}
$reviewHandle = $reviewWindows[0]
if ($Activate) {
    $reviewShell = New-Object -ComObject WScript.Shell
    $null = $reviewShell.AppActivate([ReviewNativeWindow]::Title($reviewHandle))
    [ReviewNativeWindow]::Activate($reviewHandle)
}
@{ visible = [ReviewNativeWindow]::Visible($reviewHandle); focused = [ReviewNativeWindow]::Focused($reviewHandle) } | ConvertTo-Json -Compress
