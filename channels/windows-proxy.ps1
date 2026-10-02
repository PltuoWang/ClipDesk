param([ValidateSet('Enable','Disable','Recover','Watchdog')][string]$Mode,[Parameter(Mandatory=$true)][string]$Directory,[int]$Port,[string]$CertFile,[string]$Thumbprint,[int]$ParentId)
$ErrorActionPreference='Stop'
$backupFile=Join-Path $Directory 'proxy-backup.json'
$settingsKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ClipDeskWinInet {
 [DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(IntPtr h,int option,IntPtr buffer,int length);
 public static void Refresh(){ InternetSetOption(IntPtr.Zero,39,IntPtr.Zero,0); InternetSetOption(IntPtr.Zero,37,IntPtr.Zero,0); }
}
'@
function Restore-Capture {
 if (!(Test-Path -LiteralPath $backupFile)) { return }
 $record=Get-Content -LiteralPath $backupFile -Raw | ConvertFrom-Json
 $current=Get-ItemProperty -LiteralPath $settingsKey
 # Do not overwrite a proxy subsequently selected by the user or another app.
 if ($current.ProxyServer -eq $record.OurProxy) {
  foreach ($item in $record.Values) {
   if ($item.Present) { Set-ItemProperty -LiteralPath $settingsKey -Name $item.Name -Value $item.Value }
   else { Remove-ItemProperty -LiteralPath $settingsKey -Name $item.Name -ErrorAction SilentlyContinue }
  }
  [ClipDeskWinInet]::Refresh()
 }
 if ($record.CertificateAdded) {
  $store=New-Object Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
  $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
  try { foreach ($cert in $store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$record.Thumbprint,$false)) { $store.Remove($cert) } } finally { $store.Close() }
 }
 Remove-Item -LiteralPath $backupFile
}
if ($Mode -eq 'Watchdog') {
 while (Get-Process -Id $ParentId -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 2 }
 Restore-Capture
 exit
}
if ($Mode -in @('Disable','Recover')) { Restore-Capture; exit }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid capture port' }
Restore-Capture
New-Item -ItemType Directory -Path $Directory -Force | Out-Null
$properties=Get-ItemProperty -LiteralPath $settingsKey
$values=@()
foreach ($name in @('ProxyEnable','ProxyServer','ProxyOverride','AutoConfigURL','AutoDetect')) {
 $value=$properties.PSObject.Properties[$name]
 $values+=@{ Name=$name; Present=($null -ne $value); Value=if($value){$value.Value}else{$null} }
}
$store=New-Object Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
 $already=$store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$Thumbprint,$false).Count -gt 0
 $record=@{ Values=$values; OurProxy="127.0.0.1:$Port"; Thumbprint=$Thumbprint; CertificateAdded=(!$already) }
 $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $backupFile -Encoding UTF8
 if (!$already) { $cert=New-Object Security.Cryptography.X509Certificates.X509Certificate2($CertFile); $store.Add($cert) }
} finally { $store.Close() }
try {
 # Keep the CA private key readable only by this Windows account.
 $keyFile=Join-Path $Directory 'ca-key.pem'
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=New-Object Security.AccessControl.FileSecurity
 $acl.SetOwner($identity);$acl.SetAccessRuleProtection($true,$false)
 $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','Allow')))
 Set-Acl -LiteralPath $keyFile -AclObject $acl
 Set-ItemProperty -LiteralPath $settingsKey -Name ProxyServer -Value $record.OurProxy
 Set-ItemProperty -LiteralPath $settingsKey -Name ProxyOverride -Value '<local>;localhost;127.*;[::1]'
 Remove-ItemProperty -LiteralPath $settingsKey -Name AutoConfigURL -ErrorAction SilentlyContinue
 Set-ItemProperty -LiteralPath $settingsKey -Name AutoDetect -Value 0
 Set-ItemProperty -LiteralPath $settingsKey -Name ProxyEnable -Value 1
 [ClipDeskWinInet]::Refresh()
} catch { Restore-Capture; throw }
