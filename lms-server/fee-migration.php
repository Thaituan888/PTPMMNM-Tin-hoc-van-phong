<?php
declare(strict_types=1);
// SQLite requires rebuilding CHECK constraints. Preserve all columns, IDs, indexes,
// triggers and sequences; disable FK enforcement only on this connection before BEGIN.
function lmsInitFeeConstraints(PDO $db): void {
    $definitions=[];
    foreach (['lms_classes','lms_registrations'] as $table) {
        $stmt=$db->prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?");$stmt->execute([$table]);$sql=$stmt->fetchColumn();$stmt->closeCursor();
        if ($sql && preg_match('/CHECK\s*\(\s*fee_vnd\s*=\s*1500000\s*\)/i',$sql))$definitions[$table]=$sql;
    }
    if (!$definitions){
        if ($db->query("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'")->fetchColumn())$db->exec("UPDATE sqlite_sequence SET seq=CAST(seq AS INTEGER) WHERE name IN ('lms_classes','lms_registrations') AND typeof(seq)='text'");
        return;
    }
    $db->exec('PRAGMA foreign_keys=OFF');$db->exec('BEGIN IMMEDIATE');
    try {
        foreach ($definitions as $table=>$sql) {
            $stmt=$db->prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?");$stmt->execute([$table]);$sql=$stmt->fetchColumn();$stmt->closeCursor();
            if (!preg_match('/CHECK\s*\(\s*fee_vnd\s*=\s*1500000\s*\)/i',$sql))continue;
            $stmt=$db->prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL");$stmt->execute([$table]);$extras=$stmt->fetchAll(PDO::FETCH_COLUMN);$stmt->closeCursor();
            $stmt=$db->prepare('SELECT seq FROM sqlite_sequence WHERE name=?');$stmt->execute([$table]);$seq=$stmt->fetchColumn();$stmt->closeCursor();
            $temporary=$table.'_price_v2';
            $sql=preg_replace('/^(CREATE\s+TABLE\s+)(?:IF\s+NOT\s+EXISTS\s+)?["\[]?'.preg_quote($table,'/').'["\]]?/i','$1'.$temporary,$sql,1);
            $sql=preg_replace('/CHECK\s*\(\s*fee_vnd\s*=\s*1500000\s*\)/i','CHECK(fee_vnd > 0)',$sql);
            $db->exec($sql);
            $columns=array_column($db->query('PRAGMA table_info('.$table.')')->fetchAll(),'name');$quoted=implode(',',array_map(fn($c)=>'"'.str_replace('"','""',$c).'"',$columns));
            $db->exec('INSERT INTO '.$temporary.'('.$quoted.') SELECT '.$quoted.' FROM '.$table);
            $db->exec('DROP TABLE '.$table);$db->exec('ALTER TABLE '.$temporary.' RENAME TO '.$table);
            foreach ($extras as $extra)$db->exec($extra);
            if ($seq!==false)$db->prepare('UPDATE sqlite_sequence SET seq=MAX(seq,CAST(? AS INTEGER)) WHERE name=?')->execute([(int)$seq,$table]);
        }
        if ($db->query('PRAGMA foreign_key_check')->fetchAll())throw new RuntimeException('Fee migration foreign key validation failed.');
        $db->exec('COMMIT');
    }catch(Throwable $e){$db->exec('ROLLBACK');throw $e;}
    finally{$db->exec('PRAGMA foreign_keys=ON');}
}
