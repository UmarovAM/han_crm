<?php
// api/classes/Database.php
// Класс для работы с базой данных

class Database {
    private $conn = null;
    private static $instance = null;
    
    private function __construct() {
        try {
            $host = defined('DB_HOST') ? DB_HOST : 'localhost';
            $dbname = defined('DB_NAME') ? DB_NAME : 'user2014_han';
            $user = defined('DB_USER') ? DB_USER : 'user2014_admin';
            $pass = defined('DB_PASS') ? DB_PASS : '';
            
            $this->conn = new PDO(
                "mysql:host={$host};dbname={$dbname};charset=utf8mb4",
                $user,
                $pass,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
                ]
            );
        } catch(PDOException $e) {
            error_log("Database connection error: " . $e->getMessage());
            throw new Exception("Ошибка подключения к базе данных");
        }
    }
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function getConnection() {
        return $this->conn;
    }
    
    // Подготовленный запрос с автоматической обработкой ошибок
    public function query($sql, $params = []) {
        try {
            $stmt = $this->conn->prepare($sql);
            $stmt->execute($params);
            return $stmt;
        } catch(PDOException $e) {
            error_log("Query error: " . $e->getMessage() . " SQL: " . $sql);
            throw new Exception("Ошибка выполнения запроса: " . $e->getMessage());
        }
    }
    
    // Получить одну строку
    public function fetchOne($sql, $params = []) {
        $stmt = $this->query($sql, $params);
        return $stmt->fetch();
    }
    
    // Получить все строки
    public function fetchAll($sql, $params = []) {
        $stmt = $this->query($sql, $params);
        return $stmt->fetchAll();
    }
    
    // Вставка с возвратом ID
    public function insert($sql, $params = []) {
        $this->query($sql, $params);
        return $this->conn->lastInsertId();
    }
    
    // Обновление с возвратом количества измененных строк
    public function update($sql, $params = []) {
        $stmt = $this->query($sql, $params);
        return $stmt->rowCount();
    }
    
    // Начало транзакции
    public function beginTransaction() {
        return $this->conn->beginTransaction();
    }
    
    // Коммит транзакции
    public function commit() {
        return $this->conn->commit();
    }
    
    // Откат транзакции
    public function rollback() {
        return $this->conn->rollback();
    }
    
    // Вызов хранимой процедуры
    public function callProcedure($procedureName, $params = []) {
        try {
            $placeholders = implode(',', array_fill(0, count($params), '?'));
            $sql = "CALL {$procedureName}({$placeholders})";
            
            $stmt = $this->conn->prepare($sql);
            $stmt->execute(array_values($params));
            
            // Для процедур с OUT параметрами
            $result = $stmt->fetchAll();
            $stmt->closeCursor();
            
            return $result;
        } catch(PDOException $e) {
            error_log("Procedure error: " . $e->getMessage());
            throw new Exception("Ошибка вызова процедуры: " . $e->getMessage());
        }
    }
    
    // Экранирование для LIKE запросов
    public function escapeLike($value) {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
    
    private function __clone() {}
    
    public function __wakeup() {
        throw new Exception("Cannot unserialize singleton");
    }
}