<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/phpmailer/src/Exception.php';
require_once dirname(__DIR__).'/vendor/phpmailer/src/PHPMailer.php';
require_once dirname(__DIR__).'/vendor/phpmailer/src/SMTP.php';

// Track only safe error categories; never forward SMTP replies or debug output to API/logs.
final class LmsMailSMTP extends \PHPMailer\PHPMailer\SMTP {
    public string $phase='connect';
    public bool $timedOut=false;
    public bool $tlsFailed=false;
    public int $socketError=0;
    private float $deadline;
    public function __construct() { $this->deadline=microtime(true)+45; }
    public function connect($host, $port=null, $timeout=30, $options=[]) {
        $connected=parent::connect($host,$port,$timeout,$options);
        $this->socketError=$connected?0:(int)($this->getError()['smtp_code'] ?? 0);
        // Windows can take the full timeout to report connection refused (10061).
        // Use the actual socket error, rather than treating every slow refusal as a timeout.
        if (!$connected && in_array($this->socketError,[60,110,10060],true)) $this->timedOut=true;
        if ($connected) $this->phase='greeting';
        return $connected;
    }
    public function startTLS() {
        $this->phase='tls';$result=parent::startTLS();
        if (!$result) $this->tlsFailed=true;
        return $result;
    }
    public function authenticate($username,$password,$authtype=null,$OAuth=null) {
        $this->phase='auth';$result=parent::authenticate($username,$password,$authtype,$OAuth);
        if ($result) $this->phase='delivery';
        return $result;
    }
    protected function get_lines() {
        $remaining=(int)ceil($this->deadline-microtime(true));
        if ($remaining<1) { $this->timedOut=true;throw new RuntimeException('SMTP time budget exhausted.'); }
        $this->Timeout=min($this->Timeout,$remaining);$this->Timelimit=min($this->Timelimit,$remaining);
        $start=microtime(true);$reply=parent::get_lines();
        if ($reply==='' && microtime(true)-$start>=max(1,min($this->Timeout,$this->Timelimit))*0.9) $this->timedOut=true;
        return $reply;
    }
    protected function errorHandler($errno,$errmsg,$errfile='',$errline=0) {
        if (preg_match('/certificate|crypto|SSL operation|TLS/i',$errmsg)) $this->tlsFailed=true;
        if (preg_match('/timed?\s*out/i',$errmsg)) $this->timedOut=true;
        parent::errorHandler($errno,$errmsg,$errfile,$errline);
    }
}
