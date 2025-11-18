<?php
// api/autoload.php
// Автозагрузка классов

spl_autoload_register(function ($class) {
    $classFile = __DIR__ . '/classes/' . $class . '.php';
    if (file_exists($classFile)) {
        require_once $classFile;
    }
});