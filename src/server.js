const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads folder
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// ========== SERVE HTML FILES ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ========== PING ENDPOINT FOR KEEP ALIVE ==========
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toISOString(),
        message: 'Esthyfav Collection is running!'
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ========== AUTO SELF-PING SYSTEM ==========
// This pings itself every 10 minutes to keep Render awake
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://esthyfavcollectionn.onrender.com';

function selfPing() {
    fetch(`${SELF_URL}/ping`)
        .then(res => res.json())
        .then(data => console.log(`✅ Self-ping successful at ${new Date().toISOString()}`))
        .catch(err => console.log(`⚠️ Self-ping failed: ${err.message}`));
}

// Ping every 10 minutes (600,000 ms)
setInterval(selfPing, 10 * 60 * 1000);

// Also ping on startup
setTimeout(selfPing, 1000);
console.log(`🔄 Auto self-ping enabled every 10 minutes to ${SELF_URL}`);

// ========== MONGODB CONNECTION ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mrdev:dev091339@cluster0.grjlq7v.mongodb.net/esthyfav?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => {
        console.error('❌ MongoDB Error:', err.message);
        console.log('⚠️ Running without database - using demo mode');
    });

// ========== SCHEMAS ==========
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: String, required: true },
    category: { type: String, required: true },
    imageUrl: { type: String },
    isBestseller: { type: Boolean, default: false },
    description: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    icon: { type: String },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true }
});

const brandSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String },
    imageUrl: { type: String }
});

const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, default: 'Admin' }
});

// Models
const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', categorySchema);
const BrandSetting = mongoose.model('BrandSetting', brandSettingSchema);
const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
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
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, process.env.JWT_SECRET || 'esthyfav_secret_key', (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.adminId = decoded.id;
        next();
    });
};

// ========== PUBLIC ROUTES ==========
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
        const categories = await Category.find({ isActive: true });
        res.json(categories);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        const contact = new ContactMessage({ name, email, phone, message });
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
        
        // Check if admin exists, if not create default
        let admin = await Admin.findOne({ email });
        if (!admin && email === 'admin@esthyfav.com' && password === 'devgift1') {
            const hashedPassword = await bcrypt.hash('devgift1', 10);
            admin = await Admin.create({ email: 'admin@esthyfav.com', password: hashedPassword, name: 'Super Admin' });
        }
        
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: admin._id, email: admin.email }, process.env.JWT_SECRET || 'esthyfav_secret_key', { expiresIn: '7d' });
        res.json({ success: true, token, admin: { email: admin.email, name: admin.name } });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        const { name, price, category, isBestseller, description } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const product = new Product({ name, price, category, imageUrl, isBestseller: isBestseller === 'true', description });
        await product.save();
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/products/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, price, category, isBestseller, description } = req.body;
        const updateData = { name, price, category, isBestseller: isBestseller === 'true', description };
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

app.put('/api/admin/categories/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
        const { name, slug, icon, isActive } = req.body;
        const updateData = { name, slug, icon, isActive: isActive === 'true' };
        if (req.file) updateData.imageUrl = `/uploads/${req.file.filename}`;
        const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });
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
        const messages = await ContactMessage.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (err) {
        res.json([]);
    }
});

app.delete('/api/admin/contacts/:id', verifyToken, async (req, res) => {
    try {
        await ContactMessage.findByIdAndDelete(req.params.id);
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
        const messages = await ContactMessage.countDocuments();
        const unread = await ContactMessage.countDocuments({ isRead: false });
        const bestsellers = await Product.countDocuments({ isBestseller: true });
        res.json({ products, categories, messages, unread, bestsellers });
    } catch (err) {
        res.json({ products: 0, categories: 0, messages: 0, unread: 0, bestsellers: 0 });
    }
});

// ========== INITIALIZE DEFAULT DATA ==========
async function initDatabase() {
    try {
        // Create default admin
        const existingAdmin = await Admin.findOne({ email: 'admin@esthyfav.com' });
        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash('devgift1', 10);
            await Admin.create({ email: 'admin@esthyfav.com', password: hashedPassword, name: 'Super Admin' });
            console.log('✅ Admin created: admin@esthyfav.com / devgift1');
        }

        // Create default categories
        const categories = [
            { name: 'Unisex Wears', slug: 'unisex', icon: '👕' },
            { name: 'Stylish Bags', slug: 'bags', icon: '👜' },
            { name: 'Comfy Shoes', slug: 'shoes', icon: '👟' },
            { name: 'Girly Essentials', slug: 'girly', icon: '🎀' },
            { name: 'Household Items', slug: 'household', icon: '🏠' }
        ];
        
        for (const cat of categories) {
            const exists = await Category.findOne({ slug: cat.slug });
            if (!exists) await Category.create(cat);
        }
        
        // Add sample products
        const productCount = await Product.countDocuments();
        if (productCount === 0) {
            const sampleProducts = [
                { name: 'Premium Denim Jacket', price: '₦25,000', category: 'Unisex Wears', isBestseller: true },
                { name: 'Leather Shoulder Bag', price: '₦35,000', category: 'Stylish Bags', isBestseller: true },
                { name: 'Classic White Sneakers', price: '₦22,000', category: 'Comfy Shoes', isBestseller: true },
                { name: 'Luxury Skincare Set', price: '₦15,000', category: 'Girly Essentials', isBestseller: false },
                { name: 'Premium Cookware Set', price: '₦45,000', category: 'Household Items', isBestseller: false }
            ];
            await Product.insertMany(sampleProducts);
        }
        
        console.log('✅ Database initialized');
    } catch (err) {
        console.log('⚠️ Database init warning:', err.message);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await initDatabase();
    console.log(`✨ Esthyfav Collection is LIVE!`);
    console.log(`📊 Admin: https://esthyfavcollectionn.onrender.com/admin`);
    console.log(`🔐 Email: admin@esthyfav.com | Password: devgift1`);
    console.log(`🔄 Ping endpoint: https://esthyfavcollectionn.onrender.com/ping`);
    console.log(`💚 Auto self-ping every 10 minutes - Server will stay awake!`);
});
