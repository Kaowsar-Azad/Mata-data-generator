$ErrorActionPreference = "SilentlyContinue"

Write-Host "--- Audio Services Status ---"
Get-Service -Name Audiosrv, AudioEndpointBuilder | Format-Table Name, Status, StartType -AutoSize

Write-Host "--- Microphone Privacy ---"
$privacy = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone" -Name "Value"
if ($null -ne $privacy) { 
    Write-Host "Status: $($privacy.Value)" 
} else { 
    Write-Host "Key not found (Usually allowed)" 
}

Write-Host "--- Sound Devices ---"
Get-CimInstance Win32_SoundDevice | Format-Table Caption, Status -AutoSize

Write-Host "--- Restarting Audio Service (Requires Admin Privileges) ---"
try {
    Restart-Service -Name Audiosrv -Force -ErrorAction Stop
    Write-Host "Successfully restarted Windows Audio Service."
} catch {
    Write-Host "Could not restart Audio Service (Usually requires running as Administrator)."
}
