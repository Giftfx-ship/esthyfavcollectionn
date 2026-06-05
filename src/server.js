const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads folder
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// ========== MONGODB CONNECTION ==========
const MONGODB_URI = 'mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/esthyfav?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('⚠️ MongoDB Error:', err.message));

// ========== SCHEMAS ==========
const productSchema = new mongoose.Schema({
    name: String,
    price: String,
    category: String,
    imageUrl: String,
    isBestseller: Boolean,
    createdAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
    name: String,
    slug: String,
    icon: String,
    imageUrl: String
});

const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    message: String,
    createdAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
    email: String,
    password: String
});

const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', categorySchema);
const Contact = mongoose.model('Contact', contactSchema);
const Admin = mongoose.model('Admin', adminSchema);

// ========== FILE UPLOAD ==========
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// ========== AUTH MIDDLEWARE ==========
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, 'esthyfav_secret_key');
        req.adminId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ========== SERVE HTML FILES ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/ping', (req, res) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// ========== PUBLIC API ==========
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        const contact = new Contact({ name, email, phone, message });
        await contact.save();
        res.json({ success: true, message: 'Message sent!' });
    } catch (err) {
        res.json({ success: true, message: 'Message received!' });
    }
});

// ========== ADMIN LOGIN ==========
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt:', email);
        
        // Check if admin exists
        let admin = await Admin.findOne({ email });
        
        // If no admin exists and credentials are correct, create one
        if (!admin && email === 'admin@esthyfav.com' && password === 'devgift1') {
            const hashedPassword = await bcrypt.hash('devgift1', 10);
            admin = new Admin({ email: 'admin@esthyfav.com', password: hashedPassword });
            await admin.save();
            console.log('✅ Admin created');
        }
        
        if (!admin) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        const token = jwt.sign({ id: admin._id, email: admin.email }, 'esthyfav_secret_key', { expiresIn: '7d' });
        res.json({ success: true, token, admin: { email: admin.email } });
        
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ========== ADMIN PRODUCTS ==========
app.get('/api/admin/products', verifyToken, async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/admin/products', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, price, category, isBestseller } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const product = new Product({ name, price, category, imageUrl, isBestseller: isBestseller === 'true' });
        await product.save();
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/products/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, price, category, isBestseller } = req.body;
        const updateData = { name, price, category, isBestseller: isBestseller === 'true' };
        if (req.file) updateData.imageUrl = `/uploads/${req.file.filename}`;
        const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/products/:id', verifyToken, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN CATEGORIES ==========
app.get('/api/admin/categories', verifyToken, async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/admin/categories', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, slug, icon } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const category = new Category({ name, slug, icon, imageUrl });
        await category.save();
        res.json({ success: true, category });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/categories/:id', verifyToken, async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN CONTACTS ==========
app.get('/api/admin/contacts', verifyToken, async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        res.json(contacts);
    } catch (err) {
        res.json([]);
    }
});

app.delete('/api/admin/contacts/:id', verifyToken, async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN STATS ==========
app.get('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        const products = await Product.countDocuments();
        const categories = await Category.countDocuments();
        const messages = await Contact.countDocuments();
        const bestsellers = await Product.countDocuments({ isBestseller: true });
        res.json({ products, categories, messages, unread: messages, bestsellers });
    } catch (err) {
        res.json({ products: 0, categories: 0, messages: 0, unread: 0, bestsellers: 0 });
    }
});

// ========== INITIALIZE DEFAULT DATA ==========
async function initDatabase() {
    try {
        // Create default admin if not exists
        const adminExists = await Admin.findOne({ email: 'admin@esthyfav.com' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('devgift1', 10);
            await Admin.create({ email: 'admin@esthyfav.com', password: hashedPassword });
            console.log('✅ Admin created: admin@esthyfav.com / devgift1');
        }

        // Create default categories if none exist
        const categoryCount = await Category.countDocuments();
        if (categoryCount === 0) {
            await Category.create([
                { name: 'Unisex Wears', slug: 'unisex', icon: '👕' },
                { name: 'Stylish Bags', slug: 'bags', icon: '👜' },
                { name: 'Comfy Shoes', slug: 'shoes', icon: '👟' },
                { name: 'Girly Essentials', slug: 'girly', icon: '🎀' },
                { name: 'Household Items', slug: 'household', icon: '🏠' }
            ]);
            console.log('✅ Default categories created');
        }
        
        // Create sample products if none exist
        const productCount = await Product.countDocuments();
        if (productCount === 0) {
            await Product.create([
                { name: 'Premium Denim Jacket', price: '₦25,000', category: 'Unisex Wears', isBestseller: true },
                { name: 'Leather Shoulder Bag', price: '₦35,000', category: 'Stylish Bags', isBestseller: true },
                { name: 'Classic White Sneakers', price: '₦22,000', category: 'Comfy Shoes', isBestseller: true },
                { name: 'Skincare Gift Set', price: '₦15,000', category: 'Girly Essentials', isBestseller: false },
                { name: 'Kitchen Utensil Set', price: '₦12,000', category: 'Household Items', isBestseller: false }
            ]);
            console.log('✅ Sample products created');
        }
        
        console.log('✅ Database initialized successfully');
    } catch (err) {
        console.log('⚠️ Database init warning:', err.message);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    await initDatabase();
    console.log(`✨ Esthyfav Collection is LIVE!`);
    console.log(`📊 Admin URL: http://localhost:${PORT}/admin`);
    console.log(`🔐 Login: admin@esthyfav.com | Password: devgift1`);
    
    // Self ping every 10 minutes to keep alive on Render
    setInterval(() => {
        fetch(`http://localhost:${PORT}/ping`).catch(() => {});
    }, 10 * 60 * 1000);
});
