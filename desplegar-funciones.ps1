# ═══════════════════════════════════════════════════════════════════
#  Golden Touch 1127 C.A. · Despliegue de Edge Functions
#
#  Las Edge Functions NO se publican con `git push`. El droplet sirve el
#  `dist/` compilado; las funciones viven en Supabase y suben aparte.
#
#  CÓMO USARLO
#    1. Generá un token en Supabase → Account → Access Tokens.
#    2. Abrí PowerShell en la carpeta del proyecto.
#    3. $env:SUPABASE_ACCESS_TOKEN = "sbp_tu_token_nuevo"
#    4. .\desplegar-funciones.ps1
# ═══════════════════════════════════════════════════════════════════

$ref = "rroohciwhpfonklxuoev"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "Falta el token. Corré primero:" -ForegroundColor Yellow
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "sbp_tu_token_nuevo"'
  exit 1
}

# verifyJwt refleja cómo está HOY cada función en producción. No lo cambies:
# webauthn-login corre ANTES de que el usuario tenga sesión, así que si le
# exigís JWT nadie puede entrar con huella.
$funciones = @(
  @{ n = "transfer-enviar";     jwt = $true  },   # CRÍTICA: exigía sesión pero nunca se subió
  @{ n = "enviar-checklist";    jwt = $true  },
  @{ n = "enviar-combustible";  jwt = $true  },
  @{ n = "enviar-produccion";   jwt = $true  },
  @{ n = "enviar-reporte";      jwt = $true  },
  @{ n = "enviar-salida";       jwt = $true  },
  @{ n = "enviar-trazabilidad"; jwt = $true  },
  @{ n = "webauthn-login";      jwt = $false },
  @{ n = "webauthn-register";   jwt = $true  }
)

$fallaron = @()

foreach ($f in $funciones) {
  Write-Host ""
  Write-Host "=== $($f.n) ===" -ForegroundColor Cyan
  $cmd = @("supabase", "functions", "deploy", $f.n, "--project-ref", $ref)
  if (-not $f.jwt) { $cmd += "--no-verify-jwt" }
  & npx @cmd
  if ($LASTEXITCODE -ne 0) {
    $fallaron += $f.n
    Write-Host "FALLÓ: $($f.n)" -ForegroundColor Red
  }
}

Write-Host ""
if ($fallaron.Count -eq 0) {
  Write-Host "Listas las $($funciones.Count) funciones." -ForegroundColor Green
} else {
  Write-Host "Fallaron: $($fallaron -join ', ')" -ForegroundColor Red
  exit 1
}
